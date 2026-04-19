export interface Session {
  sessionId: string;
  agentId: string;
  modelId: string;
  providerId: string;
  status: 'idle' | 'streaming' | 'paused' | 'completed' | 'error';
  abortController: AbortController;
  createdAt: number;
  updatedAt: number;
}

export class SessionManager {
  private static instance: SessionManager;
  private sessions: Map<string, Session> = new Map();

  private constructor() {
    console.log('[SessionManager] Initialized');
  }

  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  createSession(
    sessionId: string,
    data: { agentId: string; modelId: string; providerId: string }
  ): Session {
    if (this.sessions.has(sessionId)) {
      console.log(`[SessionManager] Session ${sessionId} already exists, returning existing`);
      return this.sessions.get(sessionId)!;
    }

    const session: Session = {
      sessionId,
      agentId: data.agentId,
      modelId: data.modelId,
      providerId: data.providerId,
      status: 'idle',
      abortController: new AbortController(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.sessions.set(sessionId, session);
    console.log(`[SessionManager] Session ${sessionId} created`);
    return session;
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  deleteSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.log(`[SessionManager] Session ${sessionId} not found for deletion`);
      return;
    }

    if (!session.abortController.signal.aborted) {
      session.abortController.abort();
    }

    this.sessions.delete(sessionId);
    console.log(`[SessionManager] Session ${sessionId} deleted`);
  }

  abortSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.log(`[SessionManager] Session ${sessionId} not found for abort`);
      return;
    }

    if (!session.abortController.signal.aborted) {
      session.abortController.abort();
      session.status = 'error';
      session.updatedAt = Date.now();
      console.log(`[SessionManager] Session ${sessionId} aborted`);
    } else {
      console.log(`[SessionManager] Session ${sessionId} already aborted`);
    }
  }

  listSessions(): Session[] {
    return Array.from(this.sessions.values());
  }
}
