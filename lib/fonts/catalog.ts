import {
  Bricolage_Grotesque,
  DM_Sans,
  Figtree,
  Geist,
  Geist_Mono,
  Instrument_Serif,
  IBM_Plex_Mono,
  Inter,
  JetBrains_Mono,
  Lora,
  Manrope,
  Merriweather,
  Nunito,
  Outfit,
  Plus_Jakarta_Sans,
  Poppins,
  Rubik,
  Sora,
  Source_Serif_4,
  Space_Grotesk,
  Work_Sans,
} from 'next/font/google'

/**
 * Every font a help center may choose.
 *
 * Two constraints shape this file, both from `next/font`:
 *
 * 1. Loaders resolve at BUILD time, so a runtime family name cannot be loaded —
 *    the set has to be fixed here and the picker chooses among them.
 * 2. Each call must take a LITERAL object. A shared `...options` spread fails
 *    the build ("Font loader calls must be called with explicit literal object
 *    arguments"), which is why every line below repeats itself.
 *
 * `preload: false` on everything except the default is what makes a long list
 * cheap. Applying all of these `.variable` classes only DECLARES the custom
 * properties; a family is downloaded when a rule actually references it, so a
 * visitor fetches only the font their help center chose.
 *
 * Metadata (labels, categories, the CSS variable names) lives in ./options.ts,
 * which the client-side picker imports — this module cannot cross into the
 * client graph.
 */

// The app default, and the only preloaded family: it renders before a center's
// choice is known (admin, login) and on every center that picks nothing.
const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

const inter = Inter({ subsets: ['latin'], display: 'swap', preload: false, variable: '--font-inter' })
const workSans = Work_Sans({ subsets: ['latin'], display: 'swap', preload: false, variable: '--font-work-sans' })
const figtree = Figtree({ subsets: ['latin'], display: 'swap', preload: false, variable: '--font-figtree' })
const dmSans = DM_Sans({ subsets: ['latin'], display: 'swap', preload: false, variable: '--font-dm-sans' })
const outfit = Outfit({ subsets: ['latin'], display: 'swap', preload: false, variable: '--font-outfit' })
// 800 is here for the marketing site, which sets its headlines at Growthable's
// own weight. A center that picks Poppins is unaffected — extra weights are
// only fetched when a rule asks for one.
const poppins = Poppins({ subsets: ['latin'], display: 'swap', preload: false, weight: ['400', '500', '600', '700', '800'], variable: '--font-poppins' })
const sora = Sora({ subsets: ['latin'], display: 'swap', preload: false, variable: '--font-sora' })
const plusJakarta = Plus_Jakarta_Sans({ subsets: ['latin'], display: 'swap', preload: false, variable: '--font-plus-jakarta' })
const nunito = Nunito({ subsets: ['latin'], display: 'swap', preload: false, variable: '--font-nunito' })
const manrope = Manrope({ subsets: ['latin'], display: 'swap', preload: false, variable: '--font-manrope' })
const rubik = Rubik({ subsets: ['latin'], display: 'swap', preload: false, variable: '--font-rubik' })
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], display: 'swap', preload: false, variable: '--font-space-grotesk' })
const bricolage = Bricolage_Grotesque({ subsets: ['latin'], display: 'swap', preload: false, variable: '--font-bricolage' })
const lora = Lora({ subsets: ['latin'], display: 'swap', preload: false, variable: '--font-lora' })
const sourceSerif = Source_Serif_4({ subsets: ['latin'], display: 'swap', preload: false, variable: '--font-source-serif' })
const merriweather = Merriweather({ subsets: ['latin'], display: 'swap', preload: false, weight: ['400', '700'], variable: '--font-merriweather' })
const instrumentSerif = Instrument_Serif({ subsets: ['latin'], display: 'swap', preload: false, weight: ['400'], variable: '--font-instrument-serif' })
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], display: 'swap', preload: false, variable: '--font-jetbrains-mono' })

// Growthable's own mono, used for eyebrows and figures on the marketing site.
// Deliberately absent from FONT_OPTIONS in ./options.ts: it is the marketing
// brand's face, not one a customer's help center gets to pick.
const ibmPlexMono = IBM_Plex_Mono({ subsets: ['latin'], display: 'swap', preload: false, weight: ['400', '500'], variable: '--font-ibm-plex-mono' })

/**
 * Every variable class, for <html>. Declares the custom properties named in
 * ./options.ts without fetching the fonts — see the note on `preload` above.
 */
export const ALL_FONT_VARIABLE_CLASSES = [
  geistSans.variable,
  geistMono.variable,
  inter.variable,
  workSans.variable,
  figtree.variable,
  dmSans.variable,
  outfit.variable,
  poppins.variable,
  sora.variable,
  plusJakarta.variable,
  nunito.variable,
  manrope.variable,
  rubik.variable,
  spaceGrotesk.variable,
  bricolage.variable,
  lora.variable,
  sourceSerif.variable,
  merriweather.variable,
  instrumentSerif.variable,
  jetbrainsMono.variable,
  ibmPlexMono.variable,
].join(' ')
