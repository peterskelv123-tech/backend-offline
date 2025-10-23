/* eslint-disable prettier/prettier */
import { BaseEntity } from "src/commonEntities.ts/baseORM.entity";
import { Entity, Column } from "typeorm";

@Entity('subjects')
export class Subject extends BaseEntity {
  @Column()
  Name: string;
}
