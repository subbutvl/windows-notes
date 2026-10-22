import { Composer, type Preset } from "./Composer";

const SPLASH: Preset[] = [
  { group: "Desktop app", name: "Windows / Electron splash", w: 620, h: 300 },
  { group: "Desktop app", name: "Splash window", w: 800, h: 500 },
  { group: "Desktop app", name: "macOS / Tauri splash", w: 1024, h: 640 },
  { group: "Desktop app", name: "HD", w: 1280, h: 720 },
  { group: "Desktop app", name: "Full HD", w: 1920, h: 1080 },
  { group: "Mobile app", name: "iPhone launch screen", w: 1290, h: 2796 },
  { group: "Mobile app", name: "Android splash", w: 1080, h: 1920 },
  { group: "Social profile banner", name: "X (Twitter) header", w: 1500, h: 500 },
  { group: "Social profile banner", name: "LinkedIn banner", w: 1584, h: 396 },
  { group: "Social profile banner", name: "Facebook cover", w: 1640, h: 624 },
  { group: "Social profile banner", name: "YouTube channel banner", w: 2560, h: 1440 },
  { group: "Social profile banner", name: "Twitch banner", w: 1200, h: 480 },
  { group: "Social profile banner", name: "GitHub social preview", w: 1280, h: 640 },
];

const THUMBNAILS: Preset[] = [
  { group: "Profile picture", name: "Instagram profile", w: 1080, h: 1080, round: true },
  { group: "Profile picture", name: "X / LinkedIn profile", w: 400, h: 400, round: true },
  { group: "Profile picture", name: "YouTube channel", w: 800, h: 800, round: true },
  { group: "Profile picture", name: "Facebook profile", w: 720, h: 720, round: true },
  { group: "Profile picture", name: "WhatsApp / Telegram", w: 640, h: 640, round: true },
  { group: "Social thumbnail", name: "YouTube thumbnail", w: 1280, h: 720 },
  { group: "Social thumbnail", name: "Link preview (Open Graph)", w: 1200, h: 630 },
  { group: "Social thumbnail", name: "X (Twitter) post", w: 1600, h: 900 },
  { group: "Social thumbnail", name: "Instagram post", w: 1080, h: 1080 },
  { group: "Social thumbnail", name: "Instagram portrait", w: 1080, h: 1350 },
  { group: "Social thumbnail", name: "Story / Reel / Short", w: 1080, h: 1920 },
  { group: "Social thumbnail", name: "LinkedIn post", w: 1200, h: 627 },
  { group: "Social thumbnail", name: "Pinterest pin", w: 1000, h: 1500 },
  { group: "Social thumbnail", name: "Blog cover", w: 1600, h: 840 },
];

export function SplashGenerator() {
  return (
    <Composer
      presets={SPLASH}
      pictureLabel="logo"
      fileName="splash"
      defaults={{ background: "gradient", usePicture: true, pictureSize: 35, pictureY: 30, title: "My App", subtitle: "", textPlace: "bottom", align: "center", darken: 0 }}
    />
  );
}

export function ThumbnailGenerator() {
  return (
    <Composer
      presets={THUMBNAILS}
      pictureLabel="picture on top"
      fileName="thumbnail"
      defaults={{ background: "picture", usePicture: false, pictureSize: 60, pictureY: 50, title: "", subtitle: "", textPlace: "bottom", align: "left", darken: 0 }}
    />
  );
}
