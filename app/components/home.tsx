"use client";

import { useState, useRef, useEffect, useLayoutEffect } from "react";
import throttle from "just-throttle";
import { IconButton } from "./button";
import styles from "./home.module.scss";

import SettingsIcon from "../icons/settings.svg";
import GithubIcon from "../icons/github.svg";
import StopIcon from "../icons/stop.svg";
import SendWhiteIcon from "../icons/send-white.svg";
import BrainIcon from "../icons/brain.svg";
import ExportIcon from "../icons/export.svg";
import BotIcon from "../icons/bot.svg";
import AddIcon from "../icons/add.svg";
import DeleteIcon from "../icons/delete.svg";
import LoadingIcon from "../icons/three-dots.svg";
import MenuIcon from "../icons/menu.svg";
import CloseIcon from "../icons/close.svg";
import CopyIcon from "../icons/copy.svg";
import RefreshIcon from "../icons/refresh.svg";
import DownloadIcon from "../icons/download.svg";

import { Message, SubmitKey, useChatStore, ChatSession } from "../store";
import { showModal } from "./ui-lib";
import { copyToClipboard, downloadAs, isIOS, selectOrCopy } from "../utils";
import Locale from "../locales";

import dynamic from "next/dynamic";
import {
  REPO_URL,
  PAY_URL,
  CONTACT_URL,
  QACHAT_OLD_URL,
  AD_URL,
} from "../constant";
import { ControllerPool } from "../requests";

export type RenderMessage = Message & { preview?: boolean };

export function Loading(props: { noLogo?: boolean }) {
  return (
    <div className={styles["loading-content"]}>
      {!props.noLogo && <BotIcon />}
      <LoadingIcon />
    </div>
  );
}

const Markdown = dynamic(async () => (await import("./markdown")).Markdown, {
  loading: () => <LoadingIcon />,
});

const Settings = dynamic(async () => (await import("./settings")).Settings, {
  loading: () => <Loading noLogo />,
});

const Emoji = dynamic(async () => (await import("emoji-picker-react")).Emoji, {
  loading: () => <LoadingIcon />,
});

function useSubmitHandler() {
  const config = useChatStore((state) => state.config);
  const submitKey = config.submitKey;

  const shouldSubmit = (e: KeyboardEvent) => {
    if (e.key !== "Enter") return false;

    return (
      (config.submitKey === SubmitKey.AltEnter && e.altKey) ||
      (config.submitKey === SubmitKey.CtrlEnter && e.ctrlKey) ||
      (config.submitKey === SubmitKey.ShiftEnter && e.shiftKey) ||
      (config.submitKey === SubmitKey.Enter &&
        !e.altKey &&
        !e.ctrlKey &&
        !e.shiftKey)
    );
  };

  return {
    submitKey,
    shouldSubmit,
  };
}

function useSwitchTheme() {
  const config = useChatStore((state) => state.config);

  useEffect(() => {
    document.body.classList.remove("light");
    document.body.classList.remove("dark");
    if (config.theme === "dark") {
      document.body.classList.add("dark");
    } else if (config.theme === "light") {
      document.body.classList.add("light");
    }

    const themeColor = getComputedStyle(document.body)
      .getPropertyValue("--theme-color")
      .trim();
    const metaDescription = document.querySelector('meta[name="theme-color"]');
    metaDescription?.setAttribute("content", themeColor);
  }, [config.theme]);
}

function exportMessages(messages: Message[], topic: string) {
  const mdText =
    `# ${topic}\n\n` +
    messages
      .map((m) => {
        return m.role === "user" ? `## ${m.content}` : m.content.trim();
      })
      .join("\n\n");
  const filename = `${topic}.md`;

  showModal({
    title: Locale.Export.Title,
    children: (
      <div className="markdown-body">
        <pre className={styles["export-content"]}>{mdText}</pre>
      </div>
    ),
    actions: [
      <IconButton
        key="copy"
        icon={<CopyIcon />}
        bordered
        text={Locale.Export.Copy}
        onClick={() => copyToClipboard(mdText)}
      />,
      <IconButton
        key="download"
        icon={<DownloadIcon />}
        bordered
        text={Locale.Export.Download}
        onClick={() => downloadAs(mdText, filename)}
      />,
    ],
  });
}

function showMemoryPrompt(session: ChatSession) {
  showModal({
    title: `${Locale.Memory.Title} (${session.lastSummarizeIndex} of ${session.messages.length})`,
    children: (
      <div className="markdown-body">
        <pre className={styles["export-content"]}>
          {session.memoryPrompt || Locale.Memory.EmptyContent}
        </pre>
      </div>
    ),
    actions: [
      <IconButton
        key="copy"
        icon={<CopyIcon />}
        bordered
        text={Locale.Memory.Copy}
        onClick={() => copyToClipboard(session.memoryPrompt)}
      />,
    ],
  });
}

export function Avatar(props: { role: Message["role"] }) {
  const config = useChatStore((state) => state.config);

  if (props.role === "assistant") {
    return <BotIcon className={styles["user-avtar"]} />;
  }

  return (
    <div className={styles["user-avtar"]}>
      <Emoji unified={config.avatar} size={18} />
    </div>
  );
}

export function ChatItem(props: {
  onClick?: () => void;
  onDelete?: () => void;
  title: string;
  count: number;
  time: string;
  selected: boolean;
}) {
  return (
    <div
      className={`${styles["chat-item"]} ${
        props.selected && styles["chat-item-selected"]
      }`}
      onClick={props.onClick}>
      <div className={styles["chat-item-title"]}>{props.title}</div>
      <div className={styles["chat-item-info"]}>
        <div className={styles["chat-item-count"]}>
          {Locale.ChatItem.ChatItemCount(props.count)}
        </div>
        <div className={styles["chat-item-date"]}>{props.time}</div>
      </div>
      <div className={styles["chat-item-delete"]} onClick={props.onDelete}>
        <DeleteIcon />
      </div>
    </div>
  );
}

export function ChatList() {
  const [sessions, selectedIndex, selectSession, removeSession] = useChatStore(
    (state) => [
      state.sessions,
      state.currentSessionIndex,
      state.selectSession,
      state.removeSession,
    ]
  );

  return (
    <div className={styles["chat-list"]}>
      {sessions.map((item, i) => (
        <ChatItem
          title={item.topic}
          time={item.lastUpdate}
          count={item.messages.length}
          key={i}
          selected={i === selectedIndex}
          onClick={() => selectSession(i)}
          onDelete={() => removeSession(i)}
        />
      ))}
    </div>
  );
}

export function Chat(props: { showSideBar?: () => void }) {
  let autoScrolling = true;
  const eventTypes = ["wheel", "touchmove", "keydown"];
  const [session, sessionIndex] = useChatStore((state) => [
    state.currentSession(),
    state.currentSessionIndex,
  ]);
  const [userInput, setUserInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { submitKey, shouldSubmit } = useSubmitHandler();

  const onUserInput = useChatStore((state) => state.onUserInput);

  const onUserSubmit = () => {
    if (userInput.length <= 0) return;

    autoScrolling = true;
    startAutoScroll();
    setIsLoading(true);
    onUserInput(userInput).then(() => setIsLoading(false));
    setUserInput("");
  };
  const onUserStop = (messageIndex: number) => {
    // console.log(ControllerPool, sessionIndex, messageIndex);
    ControllerPool.stop(sessionIndex, messageIndex);
  };

  const onInputKeyDown = (e: KeyboardEvent) => {
    if (shouldSubmit(e)) {
      onUserSubmit();
      e.preventDefault();
    }
  };
  const onRightClick = (e: any, message: Message) => {
    // auto fill user input
    if (message.role === "user") {
      setUserInput(message.content);
    }

    // copy to clipboard
    if (selectOrCopy(e.currentTarget, message.content)) {
      e.preventDefault();
    }
  };

  const onResend = (botIndex: number) => {
    // find last user input message and resend
    for (let i = botIndex; i >= 0; i -= 1) {
      if (messages[i].role === "user") {
        setIsLoading(true);
        onUserInput(messages[i].content).then(() => setIsLoading(false));
        return;
      }
    }
  };

  const startAutoScroll = throttle(
    () => {
      if (autoScrolling) {
        const dom = latestMessageRef.current;
        if (dom && !isIOS() && !hoveringMessage) {
          dom.scrollIntoView({
            behavior: "smooth",
            block: "end",
          });
        }
      }
    },
    250,
    { leading: true, trailing: false }
  );
  const stopAutoScroll = () => {
    if (isLoading) {
      autoScrolling = false;
    }
  };
  const eventHandler = (e: any) => {
    if (e.type === "keydown") {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") {
        return;
      }
    }
    stopAutoScroll();
  };

  const latestMessageRef = useRef<HTMLDivElement>(null);

  const [hoveringMessage, setHoveringMessage] = useState(false);

  const messages = (session.messages as RenderMessage[])
    .concat(
      isLoading
        ? [
            {
              role: "assistant",
              content: "……",
              date: new Date().toLocaleString(),
              preview: true,
            },
          ]
        : []
    )
    .concat(
      userInput.length > 0
        ? [
            {
              role: "user",
              content: userInput,
              date: new Date().toLocaleString(),
              preview: true,
            },
          ]
        : []
    );

  useLayoutEffect(() => {
    eventTypes.forEach((type) => {
      window.addEventListener(type, eventHandler, { passive: false });
    });
    startAutoScroll();
  });

  return (
    <div className={styles.chat} key={session.id}>
      <div className={styles["window-header"]}>
        <div
          className={styles["window-header-title"]}
          onClick={props?.showSideBar}>
          <div className={styles["window-header-main-title"]}>
            {session.topic}
          </div>
          <div className={styles["window-header-sub-title"]}>
            {Locale.Chat.SubTitle(session.messages.length)}
          </div>
        </div>
        <div className={styles["window-actions"]}>
          <div className={styles["window-action-button"] + " " + styles.mobile}>
            <IconButton
              icon={<MenuIcon />}
              bordered
              title={Locale.Chat.Actions.ChatList}
              onClick={props?.showSideBar}
            />
          </div>
          <div className={styles["window-action-button"]}>
            <IconButton
              icon={<BrainIcon />}
              bordered
              title={Locale.Chat.Actions.CompressedHistory}
              onClick={() => {
                showMemoryPrompt(session);
              }}
            />
          </div>
          <div className={styles["window-action-button"]}>
            <IconButton
              icon={<ExportIcon />}
              bordered
              title={Locale.Chat.Actions.Export}
              onClick={() => {
                exportMessages(session.messages, session.topic);
              }}
            />
          </div>
        </div>
      </div>

      <div className={styles["chat-body"]}>
        {messages.map((message, i) => {
          const isUser = message.role === "user";

          return (
            <div
              key={i}
              className={
                isUser ? styles["chat-message-user"] : styles["chat-message"]
              }>
              <div className={styles["chat-message-container"]}>
                <div className={styles["chat-message-avatar"]}>
                  <Avatar role={message.role} />
                </div>
                {(message.preview || message.streaming) && (
                  <div className={styles["chat-message-status"]}>
                    {Locale.Chat.Typing}
                  </div>
                )}
                <div className={styles["chat-message-item"]}>
                  <div
                    className={
                      styles[
                        isUser
                          ? "chat-message-top-actions-user"
                          : "chat-message-top-actions"
                      ]
                    }>
                    <div
                      className={styles["chat-message-top-action"]}
                      onClick={() => copyToClipboard(message.content)}>
                      <CopyIcon />
                    </div>
                    {message.streaming ? (
                      <div
                        className={styles["chat-message-top-action"]}
                        onClick={() => onUserStop(i)}>
                        <StopIcon style={{ fontSize: "12px" }} />
                      </div>
                    ) : (
                      <div
                        className={styles["chat-message-top-action"]}
                        onClick={() => onResend(i)}>
                        <RefreshIcon />
                      </div>
                    )}
                  </div>

                  {(message.preview || message.content.length === 0) &&
                  !isUser ? (
                    <LoadingIcon />
                  ) : (
                    <div
                      className="markdown-body"
                      onContextMenu={(e) => onRightClick(e, message)}>
                      <Markdown content={message.content} />
                    </div>
                  )}
                </div>
                {!isUser && !message.preview && (
                  <div className={styles["chat-message-actions"]}>
                    <div className={styles["chat-message-action-date"]}>
                      {message.date.toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={latestMessageRef} style={{ opacity: 0, height: "2em" }}>
          -
        </div>
      </div>

      <div className={styles["chat-input-panel"]}>
        <div className={styles["chat-input-panel-inner"]}>
          <textarea
            className={styles["chat-input"]}
            placeholder={Locale.Chat.Input(submitKey)}
            rows={3}
            onInput={(e) => setUserInput(e.currentTarget.value)}
            value={userInput}
            onKeyDown={(e) => onInputKeyDown(e as any)}
          />

          <IconButton
            icon={<SendWhiteIcon />}
            className={styles["chat-input-send"] + " no-dark"}
            onClick={onUserSubmit}
          />
        </div>
      </div>
    </div>
  );
}

export function Home() {
  const [createNewSession, currentIndex, removeSession] = useChatStore(
    (state) => [
      state.newSession,
      state.currentSessionIndex,
      state.removeSession,
    ]
  );
  const loading = !useChatStore?.persist?.hasHydrated();
  const [showSideBar, setShowSideBar] = useState(true);

  // setting
  const [openSettings, setOpenSettings] = useState(false);
  const config = useChatStore((state) => state.config);

  useSwitchTheme();

  if (loading) {
    return <Loading />;
  }

  return (
    <div
      className={`${
        config.fullScreen ? styles["tight-container"] : styles.container
      }`}>
      <div
        className={
          styles.sidebar + ` ${showSideBar && styles["sidebar-show"]}`
        }>
        <div className={styles["sidebar-header"]}>
          <div className={styles["sidebar-title"]}>
            QAChat <span className={styles["sidebar-title-pro"]}>𝐏𝐫𝐨</span>
          </div>
          <div className={styles["sidebar-logo"]}>
            <BotIcon />
          </div>
        </div>

        <div
          className={styles["sidebar-body"]}
          onClick={() => {
            setOpenSettings(false);
            setShowSideBar(false);
          }}>
          <ChatList />
        </div>

        <div className={styles["sidebar-tail"]}>
          <div className={styles["sidebar-actions"]}>
            <div className={styles["sidebar-action"] + " " + styles.mobile}>
              <IconButton
                icon={<CloseIcon />}
                onClick={() => {
                  if (confirm(Locale.Home.DeleteChat)) {
                    removeSession(currentIndex);
                  }
                }}
              />
            </div>
            <div className={styles["sidebar-action"]} title="设置">
              <IconButton
                icon={<SettingsIcon />}
                onClick={() => {
                  setOpenSettings(true);
                  setShowSideBar(false);
                }}
              />
            </div>
            <div className={styles["sidebar-action"]} title="源码">
              <a href={REPO_URL} target="_blank">
                <IconButton icon={<GithubIcon />} />
              </a>
            </div>
            <div className={styles["sidebar-action"]} title="打赏">
              <a
                className={styles["sidebar-action-pay"]}
                href={PAY_URL}
                target="_blank">
                <IconButton icon={<span>赏</span>} />
              </a>
            </div>
          </div>
          <div>
            <IconButton icon={<AddIcon />} onClick={createNewSession} />
          </div>
        </div>
        <div className={styles["sidebar-links"]}>
          <a href={AD_URL} target="_blank">
            购买密钥/账号
          </a>
          ·
          <a href={QACHAT_OLD_URL} target="_blank">
            旧版
          </a>
          ·<a href="javascript:;;">Q群634323049</a>
        </div>
      </div>

      <div className={styles["window-content"]}>
        {openSettings ? (
          <Settings
            closeSettings={() => {
              setOpenSettings(false);
              setShowSideBar(true);
            }}
          />
        ) : (
          <Chat key="chat" showSideBar={() => setShowSideBar(true)} />
        )}
      </div>
    </div>
  );
}
