import { MdArrowBack, MdOpenInNew, MdFavorite } from 'react-icons/md'
import { FaGithub } from 'react-icons/fa'
import { BackButton } from '../styles/SharedStyles'
import { AboutContainer, AppInfo, AppLogo, AppName, AppVersion, LinksSection, LinkItem } from '../styles/pages.styles'

const isSafari = process.env.BROWSER === 'safari'
const isFirefox = !isSafari && navigator.userAgent.toLowerCase().includes('firefox')

const REPO_URL = isSafari
  ? 'https://github.com/shmublu/Qwacky'
  : 'https://github.com/Lanshuns/Qwacky'

const STORE_URL = isFirefox
  ? 'https://addons.mozilla.org/en-US/firefox/addon/qwacky/'
  : isSafari
    ? `${REPO_URL}/tree/safari`
    : 'https://chromewebstore.google.com/detail/qwacky/kieehbhdbincplacegpjdkoglfakboeo'

const STORE_LABEL = isFirefox ? 'Firefox Add-ons' : isSafari ? 'Safari build (GitHub)' : 'Chrome Web Store'

interface AboutProps {
  onBack: () => void
}

export const About = ({ onBack }: AboutProps) => {
  return (
    <AboutContainer>
      <BackButton onClick={onBack}>
        <MdArrowBack size={20} />
        Back
      </BackButton>

      <AppInfo>
        <AppLogo src="/assets/icons/qwacky.png" alt="Qwacky" />
        <AppName>{isSafari ? 'Qwacky for Safari' : 'Qwacky'}</AppName>
        <AppVersion>v{__APP_VERSION__}</AppVersion>
        {isSafari && (
          <AppVersion style={{ marginTop: 4, opacity: 0.7 }}>
            Fork of <a href="https://github.com/Lanshuns/Qwacky" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>Lanshuns/Qwacky</a>
          </AppVersion>
        )}
      </AppInfo>

      <LinksSection>
        <LinkItem href="https://github.com/Lanshuns/Qwacky#support-the-project" target="_blank" rel="noopener noreferrer">
          <MdFavorite size={20} />
          Support the Project
          <MdOpenInNew size={16} />
        </LinkItem>
        <LinkItem href={REPO_URL} target="_blank" rel="noopener noreferrer">
          <FaGithub size={20} />
          GitHub Repository
          <MdOpenInNew size={16} />
        </LinkItem>
        <LinkItem href={STORE_URL} target="_blank" rel="noopener noreferrer">
          <MdOpenInNew size={20} />
          {STORE_LABEL}
          <MdOpenInNew size={16} />
        </LinkItem>
      </LinksSection>
    </AboutContainer>
  )
}
