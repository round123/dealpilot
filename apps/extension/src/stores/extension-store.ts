/**
 * DealPilot 插件 Zustand 临时状态
 *
 * 管理浮窗展开/收起状态、当前匹配的客户信息。
 * 不持久化（不形成 IndexedDB 双写），仅会话级临时状态。
 */

import { create } from "zustand";
import type { Customer, MatchResolveResponse } from "@dealpilot/shared";
import type { ConversationInfo } from "../lib/platform-detect";

/** 浮窗匹配状态 */
export type MatchState = "idle" | "loading" | "unique" | "multiple" | "none" | "unsupported";

interface ExtensionState {
  /** 浮窗是否展开 */
  expanded: boolean;
  /** 当前匹配状态 */
  matchState: MatchState;
  /** 当前匹配来源，用于区分自动命中与人工绑定 */
  matchMethod: MatchResolveResponse["match_method"];
  /** 当前会话信息 */
  conversation: ConversationInfo | null;
  /** 匹配到的客户（唯一命中时） */
  currentCustomer: Customer | null;
  /** 多候选列表 */
  candidates: Customer[];
  /** 错误信息 */
  error: string | null;

  // Actions
  setExpanded: (expanded: boolean) => void;
  toggleExpanded: () => void;
  setConversation: (info: ConversationInfo | null) => void;
  setMatchResult: (result: MatchResolveResponse | null) => void;
  setMatchState: (state: MatchState) => void;
  setMatchLoading: () => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useExtensionStore = create<ExtensionState>((set) => ({
  expanded: true,
  matchState: "idle",
  matchMethod: null,
  conversation: null,
  currentCustomer: null,
  candidates: [],
  error: null,

  setExpanded: (expanded) => set({ expanded }),

  toggleExpanded: () => set((state) => ({ expanded: !state.expanded })),

  setConversation: (conversation) =>
    set({ conversation, matchState: "idle", matchMethod: null, currentCustomer: null, candidates: [], error: null }),

  setMatchLoading: () => set({ matchState: "loading", error: null }),

  setMatchState: (matchState) => set({ matchState }),

  setMatchResult: (result) => {
    if (!result) {
      set({ matchState: "idle", matchMethod: null, currentCustomer: null, candidates: [] });
      return;
    }
    if (result.status === "unique") {
      set({ matchState: "unique", matchMethod: result.match_method, currentCustomer: result.customer, candidates: [] });
    } else if (result.status === "multiple") {
      set({ matchState: "multiple", matchMethod: result.match_method, currentCustomer: null, candidates: result.candidates });
    } else {
      set({ matchState: "none", matchMethod: null, currentCustomer: null, candidates: [] });
    }
  },

  setError: (error) => set({ error, matchState: "idle" }),

  reset: () =>
    set({
      expanded: true,
      matchState: "idle",
      matchMethod: null,
      conversation: null,
      currentCustomer: null,
      candidates: [],
      error: null,
    }),
}));
