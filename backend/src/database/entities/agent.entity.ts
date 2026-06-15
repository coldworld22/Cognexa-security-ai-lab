import { BaseEntity } from "./base.entity";

export interface AgentEntity extends BaseEntity {
  userId: string;
  name: string;
  description: string;
  instructions: string;
  enabledTools: string[];
}
