import { API_ERROR_CODES, ApiError } from "@dealpilot/api-client";
import type { AuthProvider } from "ra-core";

import {
  captureAgentToken,
  clearAgentToken,
  getAgentToken,
  type AgentTokenStorage,
} from "./client";
import { LOCAL_AGENT_USER_ID } from "./mappers";

export function createAgentAuthProvider(
  storage: AgentTokenStorage = window.sessionStorage,
): AuthProvider {
  const requireToken = () => {
    if (getAgentToken(storage)) return;
    throw new ApiError({
      code: API_ERROR_CODES.unauthorized,
      message: "请从 DealPilot Agent 打开的工作台地址进入",
      status: 401,
    });
  };

  return {
    async login() {
      captureAgentToken(window.location.href, storage);
      requireToken();
    },
    async logout() {
      clearAgentToken(storage);
    },
    async checkAuth() {
      requireToken();
    },
    async checkError(error) {
      if (
        error instanceof ApiError &&
        (error.status === 401 || error.code === API_ERROR_CODES.unauthorized)
      ) {
        clearAgentToken(storage);
        throw error;
      }
    },
    async getIdentity() {
      requireToken();
      return {
        id: LOCAL_AGENT_USER_ID,
        fullName: "本地用户",
      };
    },
    async canAccess() {
      requireToken();
      return true;
    },
  };
}
