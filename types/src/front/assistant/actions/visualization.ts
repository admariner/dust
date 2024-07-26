import * as t from "io-ts";

import { ModelId } from "../../../shared/model_id";
import { BaseAction } from "../../lib/api/assistant/actions";

// Configuration
export type VisualizationConfigurationType = {
  id: ModelId; // AgentVisualizationConfiguration ID
  sId: string;
  type: "visualization_configuration";
  name: string;
  description: string | null;
};

// Action execution
export interface VisualizationActionType extends BaseAction {
  agentMessageId: ModelId;
  generation: string | null;
  functionCallId: string | null;
  functionCallName: string | null;
  step: number;
  type: "visualization_action";
}

export const VisualizationActionOutputSchema = t.type({
  generation: t.string,
});

export function visualizationExtractCode(code: string): {
  extractedCode: string;
  isComplete: boolean;
} {
  const regex = /<visualization[^>]*>\s*([\s\S]*?)\s*(<\/visualization>|$)/;
  let extractedCode: string | null = null;
  const match = code.match(regex);
  if (match && match[1]) {
    extractedCode = match[1];
  }
  if (!extractedCode) {
    return { extractedCode: "", isComplete: false };
  }

  return {
    extractedCode: extractedCode,
    isComplete: code.includes("</visualization>"),
  };
}

// This defines the commands that the iframe can send to the host window.

// Common base interface.
interface VisualizationRPCRequestBase {
  actionId: number;
  messageUniqueId: string;
}

// Define parameter types for each command.

interface GetFileParams {
  fileId: string;
}

interface RetryParams {
  errorMessage: string;
}

interface SetContentHeightParams {
  height: number;
}

// Define a mapped type to extend the base with specific parameters.
export type VisualizationRPCRequestMap = {
  getFile: GetFileParams;
  getCodeToExecute: null;
  retry: RetryParams;
  setContentHeight: SetContentHeightParams;
};

// Derive the command type from the keys of the request map
export type VisualizationRPCCommand = keyof VisualizationRPCRequestMap;

// Create a union type for requests based on the mapped type.
export type VisualizationRPCRequest = {
  [K in VisualizationRPCCommand]: VisualizationRPCRequestBase & {
    command: K;
    params: VisualizationRPCRequestMap[K];
  };
}[VisualizationRPCCommand];

export const validCommands: VisualizationRPCCommand[] = [
  "getFile",
  "getCodeToExecute",
  "retry",
  "setContentHeight",
];

// Command results.

export interface CommandResultMap {
  getFile: { fileBlob: Blob | null };
  getCodeToExecute: { code: string };
  retry: void;
  setContentHeight: void;
}

// Type guard for getFile.
export function isGetFileRequest(
  value: unknown
): value is VisualizationRPCRequest & {
  command: "getFile";
  params: GetFileParams;
} {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const v = value as Partial<VisualizationRPCRequest>;

  return (
    v.command === "getFile" &&
    typeof v.actionId === "number" &&
    typeof v.messageUniqueId === "string" &&
    typeof v.params === "object" &&
    v.params !== null &&
    typeof (v.params as GetFileParams).fileId === "string"
  );
}

// Type guard for getCodeToExecute.
export function isGetCodeToExecuteRequest(
  value: unknown
): value is VisualizationRPCRequest & {
  command: "getCodeToExecute";
  params: null;
} {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const v = value as Partial<VisualizationRPCRequest>;

  return (
    v.command === "getCodeToExecute" &&
    typeof v.actionId === "number" &&
    typeof v.messageUniqueId === "string"
  );
}

// Type guard for retry.
export function isRetryRequest(
  value: unknown
): value is VisualizationRPCRequest & {
  command: "retry";
  params: RetryParams;
} {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const v = value as Partial<VisualizationRPCRequest>;

  return (
    v.command === "retry" &&
    typeof v.actionId === "number" &&
    typeof v.messageUniqueId === "string" &&
    typeof v.params === "object" &&
    v.params !== null &&
    typeof (v.params as RetryParams).errorMessage === "string"
  );
}

// Type guard for setContentHeight.
export function isSetContentHeightRequest(
  value: unknown
): value is VisualizationRPCRequest & {
  command: "setContentHeight";
  params: SetContentHeightParams;
} {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const v = value as Partial<VisualizationRPCRequest>;

  return (
    v.command === "setContentHeight" &&
    typeof v.actionId === "number" &&
    typeof v.messageUniqueId === "string" &&
    typeof v.params === "object" &&
    v.params !== null &&
    typeof (v.params as SetContentHeightParams).height === "number"
  );
}

export function isVisualizationRPCRequest(
  value: unknown
): value is VisualizationRPCRequest {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return (
    isGetCodeToExecuteRequest(value) ||
    isGetFileRequest(value) ||
    isRetryRequest(value) ||
    isSetContentHeightRequest(value)
  );
}
