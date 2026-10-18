import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsDefined,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
export class FramesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(2147483647, { each: true })
  timestampsMs!: number[];
}
export class LocalVideoDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{1,128}$/) externalId!: string;
  @IsString() @MinLength(1) @MaxLength(300) title!: string;
}
export class ElementDto {
  @IsString() @MinLength(1) @MaxLength(80) id!: string;
  @IsIn(["text", "image"]) type!: "text" | "image";
  @IsNumber() @Min(-5000) @Max(5000) x!: number;
  @IsNumber() @Min(-5000) @Max(5000) y!: number;
  @IsNumber() @Min(1) @Max(5000) width!: number;
  @IsNumber() @Min(1) @Max(5000) height!: number;
  @IsOptional() @IsNumber() @Min(-360) @Max(360) rotation?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) opacity?: number;
  @IsOptional() @IsBoolean() visible?: boolean;
  @IsOptional() @IsUUID() assetId?: string;
  @IsOptional() @IsString() @MaxLength(2000) text?: string;
  @IsOptional() @IsString() @MaxLength(100) fontFamily?: string;
  @IsOptional() @IsInt() @Min(8) @Max(400) fontSize?: number;
  @IsOptional()
  @IsIn(["normal", "bold", "italic", "bold italic"])
  fontStyle?: string;
  @IsOptional() @IsIn(["left", "center", "right"]) align?: string;
  @IsOptional() @Matches(/^#[0-9a-fA-F]{6}$/) fill?: string;
  @IsOptional() @Matches(/^#[0-9a-fA-F]{6}$/) stroke?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(30) strokeWidth?: number;
  @IsOptional() @Matches(/^#[0-9a-fA-F]{6}$/) shadowColor?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) shadowBlur?: number;
  @IsOptional() @IsNumber() @Min(-100) @Max(100) shadowOffsetX?: number;
  @IsOptional() @IsNumber() @Min(-100) @Max(100) shadowOffsetY?: number;
}
export class DocumentDto {
  @Equals(1) version!: 1;
  @Equals(1280) width!: 1280;
  @Equals(720) height!: 720;
  @Matches(/^#[0-9a-fA-F]{6}$/) backgroundColor!: string;
  @IsOptional() @IsUUID() backgroundAssetId?: string;
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ElementDto)
  elements!: ElementDto[];
}
export class DraftDto {
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsDefined()
  @ValidateNested()
  @Type(() => DocumentDto)
  document!: DocumentDto;
}
export class UpdateDraftDto extends DraftDto {
  @IsInt() @Min(1) revision!: number;
}
