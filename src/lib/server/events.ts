import { EventEmitter } from "events";

export interface FacadeEvent {
	type: "message" | "huddle_update";
	conversationId?: string;
	sender?: string;
	content?: string;
	timestamp?: string;
}

const emitter = new EventEmitter();
emitter.setMaxListeners(100);

export function emitEvent(event: FacadeEvent): void {
	emitter.emit("facade-event", event);
}

export function onEvent(listener: (event: FacadeEvent) => void): () => void {
	emitter.on("facade-event", listener);
	return () => {
		emitter.off("facade-event", listener);
	};
}
