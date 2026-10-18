import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
export class GenerateBackgroundDto {
  @IsUUID() requestId!: string;
  @IsIn(["horror", "funny", "cute", "epic"]) style!:
    "horror" | "funny" | "cute" | "epic";
  @IsString() @MinLength(3) @MaxLength(1500) prompt!: string;
  @IsOptional() @IsString() @MaxLength(1000) negativePrompt?: string;
  @IsInt() @Min(1) @Max(3) variations!: number;
  @IsOptional() @IsInt() @Min(0) @Max(2147483644) seed?: number;
  @IsOptional() @IsIn(["standard", "low"]) resolution?: "standard" | "low";
  @IsOptional() @IsInt() @Min(10) @Max(30) steps?: number;
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(1)
  @Max(10)
  cfg?: number;
}
