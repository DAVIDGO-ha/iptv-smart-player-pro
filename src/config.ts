// Your IPTV Smart Player PRO website (built in v0 / Vercel). Clients open it on their phone to add playlists to their TV.
// This app's own website. Can be overridden with the SITE_URL GitHub Actions variable.
export const SITE_URL: string = (process.env.SITE_URL || 'https://www.iptv-smart-player-pro.com').replace(/\/+$/, '')
export const SITE_LABEL = SITE_URL.replace(/^https?:\/\//, '')
