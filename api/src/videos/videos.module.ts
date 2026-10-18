import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { VideosService } from "./videos.service";
import { VideosController } from "./videos.controller";
@Module({
  imports: [DatabaseModule],
  controllers: [VideosController],
  providers: [VideosService],
  exports: [VideosService],
})
export class VideosModule {}
