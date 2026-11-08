import { InboxMessageState, ReceiveInboxProps } from './inbox-types';

export class InboxMessage {
  public readonly messageId: string;
  public readonly consumerName: string;
  public readonly payloadHash: string;
  public readonly receivedAt: Date;
  private _processedAt?: Date;

  private constructor(props: {
    messageId: string;
    consumerName: string;
    payloadHash: string;
    receivedAt: Date;
    processedAt?: Date;
  }) {
    this.messageId = props.messageId;
    this.consumerName = props.consumerName;
    this.payloadHash = props.payloadHash;
    this.receivedAt = props.receivedAt;
    this._processedAt = props.processedAt;
  }

  static receive(props: ReceiveInboxProps): InboxMessage {
    return new InboxMessage({
      messageId: props.messageId,
      consumerName: props.consumerName,
      payloadHash: props.payloadHash,
      receivedAt: props.receivedAt ?? new Date(),
    });
  }

  static rehydrate(state: InboxMessageState): InboxMessage {
    return new InboxMessage({
      messageId: state.messageId,
      consumerName: state.consumerName,
      payloadHash: state.payloadHash,
      receivedAt: state.receivedAt,
      processedAt: state.processedAt,
    });
  }

  get processedAt(): Date | undefined {
    return this._processedAt;
  }

  isProcessed(): boolean {
    return this._processedAt !== undefined;
  }

  markProcessed(at?: Date): void {
    if (this._processedAt) {
      return;
    }
    this._processedAt = at ?? new Date();
  }

  toJSON(): InboxMessageState {
    return {
      messageId: this.messageId,
      consumerName: this.consumerName,
      payloadHash: this.payloadHash,
      receivedAt: this.receivedAt,
      processedAt: this._processedAt,
    };
  }
}
