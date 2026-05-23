export type DisplayPost = {
  id: number;
  url: string;
  remoteUrl: string;
  width: number;
  height: number;
  rating: string;
  artists: string[];
  score: number;
  groupId: number;
  groupName: string;
  contributorName: string | null;
};

export type TransitionKind = "fade" | "fade-black" | "slide" | "zoom";
export type OverlayMode = "off" | "occasional" | "always";
export type OverlayVerbosity = "qr-only" | "minimal" | "normal" | "verbose";
export type OverlayCorner = "tl" | "tr" | "bl" | "br";
export type LayoutKind = "single" | "split-v" | "split-h" | "diag";
export type CommentsMode = "off" | "immediate" | "replay" | "both";

export type DisplayState = {
  current: DisplayPost | null;
  extras: DisplayPost[];
  layout: LayoutKind;
  startedAt: number | null;
  durationMs: number;
  fadeMs: number;
  transition: TransitionKind;
  upcoming: DisplayPost[];
  history: DisplayPost[];
  paused: boolean;
  overlay: {
    visible: boolean;
    until: number | null;
    mode: OverlayMode;
    verbosity: OverlayVerbosity;
  };
};

export type AppSettings = {
  slideDurationMs: number;
  fadeMs: number;
  enabledTransitions: TransitionKind[];
  overlayMode: OverlayMode;
  overlayIntervalMs: number;
  overlayDurationMs: number;
  overlayVerbosity: OverlayVerbosity;
  overlayOpacity: number;
  overlayScale: number;
  overlayCorner: OverlayCorner;
  wifiSsid: string | null;
  enabledLayouts: LayoutKind[];
  multiplexProbability: number;
  reactionsEnabled: boolean;
  commentsMode: CommentsMode;
  musicEnabled: boolean;
  musicStation: string;
  musicVolume: number;
  imageCooldownMs: number;
  telegramEnabled: boolean;
  telegramBotToken: string;
  telegramChatId: string;
  telegramAnnounceMode: "off" | "everyImage" | "onMilestone";
  telegramCommandsEnabled: boolean;
  telegramMilestoneLikes: number;
  reactionConfettiEnabled: boolean;
  reactionConfettiThreshold: number;
  reactionConfettiWindowMs: number;
};

export type ReactionEvent = {
  kind: "up" | "emoji";
  emoji: string;
  postId: number;
  userName: string;
  total: number | null;
  at: number;
};

export type CommentEvent = {
  id: number;
  postId: number;
  userName: string;
  text: string;
  at: number;
  origin: "live" | "replay";
};

export type ServerInfo = {
  hostname: string;
  ips: string[];
  primaryIp: string | null;
  url: string | null;
  qr: string | null;
  ssid: string | null;
  port: number;
};

export type Contribution = {
  id: number;
  group_id: number;
  user_id: number | null;
  user_name: string | null;
  action: string;
  detail: string | null;
  at: number;
};

export type Group = {
  id: number;
  name: string;
  tags: string;
  image_limit: number;
  enabled: boolean;
  priority: number;
  created_by: number | null;
  created_at: number;
  contributions: Contribution[];
};

export type SearchPost = {
  id: number;
  preview: string | null;
  sample: string | null;
  file: string | null;
  width: number;
  height: number;
  rating: string;
  score: number;
  artists: string[];
};

export type SearchResult = {
  posts: SearchPost[];
  approxTotal: number | null;
  hasMore: boolean;
};
