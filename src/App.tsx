import { useApp } from './context/AppContext'
import styled, { createGlobalStyle, ThemeProvider } from 'styled-components'
import { Login } from './pages/Login'
import { OTP } from './pages/OTP'
import { Dashboard } from './pages/Dashboard'
import { Header } from './components/Header'
import { ConfirmDialog } from './components/ConfirmDialog'
import { theme } from './theme'
import { lazy, Suspense, useState, useEffect } from 'react'

const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })))
const Changelog = lazy(() => import('./pages/Changelog').then(m => ({ default: m.Changelog })))
const About = lazy(() => import('./pages/About').then(m => ({ default: m.About })))
const MyAccount = lazy(() => import('./pages/MyAccount').then(m => ({ default: m.MyAccount })))

const APP_VERSION = __APP_VERSION__

const GlobalStyle = createGlobalStyle`
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes scaleIn {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
  }

  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  *:focus:not(:focus-visible) {
    outline: none;
  }

  html, body {
    margin: 0;
    padding: 0;
  }

  /* The scroll deliberately does NOT live on html/body. In a Safari Web
     Extension popup the document scroll position is reset every time Safari
     re-lays-out the popup (which it does as async data loads and on repaint) —
     that is what made the popup "scroll back up". The popup is a fixed-size
     shell (Container) and the scroll lives on an inner element (ScrollArea). */
  body {
    width: 400px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
      Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
    background: ${props => props.theme.background};
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  ::selection {
    background: ${props => props.theme.primary}30;
    color: ${props => props.theme.text};
  }

  ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  ::-webkit-scrollbar-track {
    background: transparent;
  }

  ::-webkit-scrollbar-thumb {
    background: ${props => props.theme.border};
    border-radius: 3px;
    transition: background 0.2s;

    &:hover {
      background: ${props => `${props.theme.primary}80`};
    }
  }
`

// Fixed-size popup shell. A stable, definite height (a) stops Safari from
// continuously re-sizing the popup — the trigger for the scroll-position reset —
// and (b) gives the inner ScrollArea a height to bound its scroll. We use a
// plain fixed px height (NOT vh): 100vh in a Safari popup can resolve to ~0
// during initial layout and collapse the whole popup. 600px sits within
// Safari's popup height cap on normal displays.
const Container = styled.div`
  width: 400px;
  max-width: 100%;
  height: 600px;
  display: flex;
  flex-direction: column;
  color: ${props => props.theme.text};
  position: relative;
  background: ${props => props.theme.background};
  overflow: hidden;
`

// The header stays pinned; it must not scroll or shrink.
const HeaderSlot = styled.div`
  flex: 0 0 auto;
`

// The single scroll surface for the popup. min-height: 0 is required for a flex
// child to actually scroll instead of growing the parent. overscroll-behavior:
// contain stops rubber-banding from leaking to Safari's chrome. NOTE: we do NOT
// put transform/will-change here — an overflow:auto element already gets its own
// composited scrolling layer in WebKit, and a transform would make this the
// containing block for every position:fixed modal rendered inside it (clipping
// the confirm dialogs / pickers). The fix for jank is owning the scroll on this
// bounded element instead of the document, not a compositing hint.
const ScrollArea = styled.div`
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
`

export const App = () => {
  const { darkMode, userData } = useApp()
  const [currentPage, setCurrentPage] = useState('login')
  const [tempUsername, setTempUsername] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [showChangelog, setShowChangelog] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [showMyAccount, setShowMyAccount] = useState(false)
  const [addingAccount, setAddingAccount] = useState(false)
  const [autoLoginAccount, setAutoLoginAccount] = useState<string | null>(null)
  const [autoLoginError, setAutoLoginError] = useState<string | null>(null)

  useEffect(() => {
    chrome.storage.local.get([
      'loginState',
      'tempUsername',
      'addingAccount',
      'lastVersion',
      'showSettings',
      'auto_login_account',
      'auto_login_error'
    ], (result) => {
      if (result.loginState) {
        setCurrentPage(result.loginState)
      }
      if (result.tempUsername) {
        setTempUsername(result.tempUsername)
      }
      if (result.addingAccount) {
        setAddingAccount(true)
      }
      if (result.showSettings !== undefined) {
        setShowSettings(result.showSettings)
      }
      if (result.auto_login_account) {
        setAutoLoginAccount(result.auto_login_account)
        setAddingAccount(false)
        chrome.storage.local.remove(['auto_login_account', 'addingAccount', 'loginState', 'tempUsername'])
      }
      if (result.auto_login_error) {
        setAutoLoginError(result.auto_login_error)
        chrome.storage.local.remove('auto_login_error')
      }
      if (userData && result.lastVersion !== APP_VERSION) {
        setShowChangelog(true)
        chrome.storage.local.set({ lastVersion: APP_VERSION })
      }
    })
  }, [userData])

  useEffect(() => {
    const handleAutoLogin = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName === 'local' && changes.auto_login_account?.newValue) {
        setAutoLoginAccount(changes.auto_login_account.newValue)
        setAddingAccount(false)
        chrome.storage.local.remove(['auto_login_account', 'addingAccount', 'loginState', 'tempUsername'])
      }
      if (areaName === 'local' && changes.auto_login_error?.newValue) {
        setAutoLoginError(changes.auto_login_error.newValue)
        chrome.storage.local.remove('auto_login_error')
      }
    }
    chrome.storage.onChanged.addListener(handleAutoLogin)
    return () => chrome.storage.onChanged.removeListener(handleAutoLogin)
  }, [])

  useEffect(() => {
    if (!userData) {
      setCurrentPage('login')
      setTempUsername('')
      setShowSettings(false)
      setShowChangelog(false)
      setShowAbout(false)
      setShowMyAccount(false)
      setAddingAccount(false)
      chrome.storage.local.remove([
        'loginState',
        'tempUsername',
        'addingAccount',
        'otp_verification_in_progress'
      ])
    }
  }, [userData])

  const updateLoginState = (page: string, username?: string) => {
    const storageData: { loginState: string; tempUsername?: string } = { loginState: page }
    setCurrentPage(page)
    
    if (username) {
      setTempUsername(username)
      storageData.tempUsername = username
    }
    
    chrome.storage.local.set(storageData)
  }

  const resetLoginState = () => {
    setCurrentPage('login')
    setTempUsername('')
    chrome.storage.local.remove(['loginState', 'tempUsername'])
  }

  const toggleSettings = () => {
    const newShowSettings = !showSettings
    setShowSettings(newShowSettings)
    chrome.storage.local.set({ showSettings: newShowSettings })
    if (newShowSettings) {
      setShowChangelog(false)
      setShowAbout(false)
      setShowMyAccount(false)
    }
  }

  const toggleChangelog = () => {
    const newShowChangelog = !showChangelog
    setShowChangelog(newShowChangelog)
    if (newShowChangelog) {
      setShowSettings(false)
      setShowAbout(false)
      setShowMyAccount(false)
      chrome.storage.local.set({ showSettings: false })
    }
  }

  const toggleAbout = () => {
    const newShowAbout = !showAbout
    setShowAbout(newShowAbout)
    if (newShowAbout) {
      setShowSettings(false)
      setShowChangelog(false)
      setShowMyAccount(false)
      chrome.storage.local.set({ showSettings: false })
    }
  }

  const toggleMyAccount = () => {
    const newShowMyAccount = !showMyAccount
    setShowMyAccount(newShowMyAccount)
    if (newShowMyAccount) {
      setShowSettings(false)
      setShowChangelog(false)
      setShowAbout(false)
      chrome.storage.local.set({ showSettings: false })
    }
  }
  
  const handleAddAccount = () => {
    setAddingAccount(true)
    setCurrentPage('login')
    setShowSettings(false)
    setShowChangelog(false)
    setShowMyAccount(false)
    chrome.storage.local.set({ showSettings: false, addingAccount: true, loginState: 'login' })
  }
  
  const handleCancelAddAccount = () => {
    setAddingAccount(false)
    setCurrentPage('login')
    setTempUsername('')
    chrome.storage.local.remove([
      'addingAccount', 
      'loginState', 
      'tempUsername', 
      'otp_verification_in_progress',
      'showSettings'
    ])
  }
  
  const renderCurrentPage = () => {
    if (showSettings) return <Settings onBack={toggleSettings} />
    if (showAbout) return <About onBack={toggleAbout} />
    if (showMyAccount) return <MyAccount onBack={toggleMyAccount} />
    if (showChangelog) return <Changelog onBack={toggleChangelog} />

    if (!userData || addingAccount) {
      if (currentPage === 'login') {
        return (
          <Login
            onSubmit={(username) => {
              updateLoginState('otp', username)
              setShowSettings(false)
              setShowChangelog(false)
              setShowAbout(false)
              chrome.storage.local.set({ showSettings: false })
            }}
            isAddingAccount={addingAccount}
            onBack={addingAccount ? handleCancelAddAccount : undefined}
          />
        )
      }
      if (currentPage === 'otp') {
        return (
          <OTP
            username={tempUsername}
            onBack={() => {
              resetLoginState()
              if (addingAccount && userData) {
                handleCancelAddAccount()
              }
              setShowSettings(false)
              setShowChangelog(false)
              setShowAbout(false)
              chrome.storage.local.set({ showSettings: false })
            }}
            isAddingAccount={addingAccount}
            onSuccess={() => {
              if (addingAccount) {
                handleCancelAddAccount()
              }
              setShowSettings(false)
              setShowChangelog(false)
              setShowAbout(false)
              chrome.storage.local.set({ showSettings: false })
            }}
          />
        )
      }
    }

    if (userData && !addingAccount) {
      return <Dashboard />
    }

    return null
  }

  return (
    <ThemeProvider theme={darkMode ? theme.dark : theme.light}>
      <GlobalStyle />
      <Container>
        <HeaderSlot>
          <Header
            onSettingsClick={toggleSettings}
            onAddAccountClick={handleAddAccount}
            onChangelogClick={toggleChangelog}
            onAboutClick={toggleAbout}
            onMyAccountClick={toggleMyAccount}
          />
        </HeaderSlot>
        <ScrollArea>
          <Suspense fallback={<div style={{ padding: 24, textAlign: 'center', opacity: 0.6 }}>Loading…</div>}>
            {renderCurrentPage()}
          </Suspense>
        </ScrollArea>
        <ConfirmDialog
          isOpen={autoLoginAccount !== null}
          variant="info"
          title="Logged In Successfully"
          message={`Automatically logged in as ${autoLoginAccount}@duck.com`}
          confirmLabel="Got it"
          singleButton
          onConfirm={() => setAutoLoginAccount(null)}
        />
        <ConfirmDialog
          isOpen={autoLoginError !== null}
          variant="warning"
          title="Auto-Login Failed"
          message={autoLoginError || ''}
          confirmLabel="OK"
          singleButton
          onConfirm={() => setAutoLoginError(null)}
        />
      </Container>
    </ThemeProvider>
  )
}