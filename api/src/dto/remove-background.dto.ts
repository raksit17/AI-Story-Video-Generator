import { Type } from "class-transformer";
import {
  IsDefined,
  IsInt,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
export class CropDto {
  @IsInt() @Min(0) @Max(24000) x!: number;
  @IsInt() @Min(0) @Max(24000) y!: number;
  @IsInt() @Min(8) @Max(2048) width!: number;
  @IsInt() @Min(8) @Max(2048) height!: number;
}
export class RemoveBackgroundDto {
  @IsUUID() sourceAssetId!: string;
  @IsDefined() @ValidateNested() @Type(() => CropDto) crop!: CropDto;
}
