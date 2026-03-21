import React from "react";
import { Composition } from "remotion";
import { EEVideo, TOTAL_DURATION } from "./EEVideo";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="EEPromo"
      component={EEVideo}
      durationInFrames={TOTAL_DURATION}
      fps={30}
      width={1080}
      height={1920}
    />
  );
};
