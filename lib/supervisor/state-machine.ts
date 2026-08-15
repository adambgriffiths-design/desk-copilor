import type { SupervisorLoopState } from "./types";

const TRANSITIONS: Record<SupervisorLoopState, SupervisorLoopState[]> = {
  IDLE: ["DISPATCH", "STOP"],
  DISPATCH: ["WAIT", "EVALUATE", "STOP"],
  WAIT: ["EVALUATE", "STOP"],
  EVALUATE: ["SELECT_NEXT", "STOP"],
  SELECT_NEXT: ["DISPATCH", "STOP"],
  STOP: [],
};

export class SupervisorStateMachine {
  state: SupervisorLoopState = "IDLE";

  transition(next: SupervisorLoopState): void {
    const allowed = TRANSITIONS[this.state];
    if (!allowed.includes(next)) {
      throw new Error(`Invalid supervisor transition: ${this.state} -> ${next}`);
    }
    this.state = next;
  }

  forceStop(): void {
    this.state = "STOP";
  }

  isTerminal(): boolean {
    return this.state === "STOP";
  }
}

export { TRANSITIONS };
