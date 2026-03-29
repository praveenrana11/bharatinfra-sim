export const BHARATINFRA_ONBOARDING_STORAGE_KEY = "bharatinfra_onboarding_seen";
export const HOW_TO_PLAY_OPEN_EVENT = "bharatinfra-how-to-play:open";
export const HOW_TO_PLAY_SEEN_EVENT = "bharatinfra-how-to-play:seen";

export type HowToPlayOpenDetail = {
  slide?: number;
};

export function openHowToPlay(slide = 0) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent<HowToPlayOpenDetail>(HOW_TO_PLAY_OPEN_EVENT, {
      detail: { slide },
    })
  );
}
