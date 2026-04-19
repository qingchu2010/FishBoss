import { PlatformService } from "./service.js";
import type {
  PlatformResponse,
  PlatformDetailResponse,
  ConnectionTestResult,
  SendMessageResult,
  PlatformTypeMetadata,
  PlatformRuntimeStatus,
} from "./schema.js";

export interface PlatformRoutes {
  list(): Promise<PlatformResponse[]>;
  listMetadata(): Promise<{ platformTypes: PlatformTypeMetadata[] }>;
  get(id: string): Promise<PlatformDetailResponse | null>;
  create(data: unknown): Promise<PlatformResponse>;
  update(id: string, data: unknown): Promise<PlatformResponse | null>;
  delete(id: string): Promise<boolean>;
  testConnection(id: string): Promise<ConnectionTestResult>;
  sendMessage(
    id: string,
    target: string,
    message: unknown,
  ): Promise<SendMessageResult | null>;
  getPlatformMetadata(id: string): Promise<Record<string, unknown> | null>;
  getRuntimeStatus(id: string): Promise<PlatformRuntimeStatus | null>;
  startRuntime(id: string): Promise<PlatformRuntimeStatus>;
  stopRuntime(id: string): Promise<PlatformRuntimeStatus>;
}

export function createPlatformRoutes(
  service?: PlatformService,
): PlatformRoutes {
  const svc = service ?? new PlatformService();

  return {
    list: () => svc.list(),
    listMetadata: () => svc.getMetadata(),
    get: (id) => svc.get(id),
    create: (data) => svc.create(data),
    update: (id, data) => svc.update(id, data),
    delete: (id) => svc.delete(id),
    testConnection: (id) => svc.testConnection(id),
    sendMessage: (id, target, message) => svc.sendMessage(id, target, message),
    getPlatformMetadata: (id) => svc.getPlatformMetadata(id),
    getRuntimeStatus: (id) => svc.getRuntimeStatus(id),
    startRuntime: (id) => svc.startRuntime(id),
    stopRuntime: (id) => svc.stopRuntime(id),
  };
}
