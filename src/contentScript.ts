type BrowserType = typeof chrome;
declare const browser: BrowserType;
const api: BrowserType = typeof browser !== 'undefined' ? browser : chrome;

// On Safari the address is presented as a click-to-copy banner instead of
// being typed into the focused field, so password-manager save-credentials
// flows keep working. The banner click is also the user gesture that Safari
// requires for navigator.clipboard.writeText.
const SAFARI = process.env.BROWSER === 'safari'

const extensionAlive = () => {
  try { return !!api.runtime?.id } catch { return false }
}

const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

const baseStyles: Partial<CSSStyleDeclaration> = {
  position: 'fixed',
  top: '24px',
  right: '24px',
  background: '#ff9f19',
  color: 'white',
  padding: '12px 16px',
  borderRadius: '8px',
  zIndex: '2147483647',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
  fontSize: '14px',
  maxWidth: '320px',
}

const showNotification = (message: string) => {
  const notification = document.createElement('div')
  Object.assign(notification.style, baseStyles)
  notification.setAttribute('role', 'status')
  notification.setAttribute('aria-live', 'polite')
  notification.textContent = message === 'Not authenticated' ? 'You need to login first' : message
  document.body.appendChild(notification)
  setTimeout(() => notification.remove(), 3000)
}

const showCopyBanner = (fullAddress: string) => {
  const banner = document.createElement('div')
  Object.assign(banner.style, baseStyles, { cursor: 'pointer' })
  banner.setAttribute('role', 'status')
  banner.setAttribute('aria-live', 'polite')

  const render = (label: string, value: string, hint?: string) => {
    banner.replaceChildren()
    const labelEl = document.createElement('div')
    labelEl.style.fontSize = '12px'
    labelEl.style.opacity = '0.85'
    labelEl.textContent = label
    const valueEl = document.createElement('div')
    valueEl.style.fontWeight = '600'
    valueEl.style.userSelect = 'all'
    valueEl.textContent = value
    banner.append(labelEl, valueEl)
    if (hint) {
      const hintEl = document.createElement('div')
      hintEl.style.fontSize = '12px'
      hintEl.style.marginTop = '4px'
      hintEl.style.opacity = '0.85'
      hintEl.textContent = hint
      banner.append(hintEl)
    }
  }

  render('Qwacky alias', fullAddress, 'Click to copy')
  banner.addEventListener('click', async () => {
    const ok = await copyToClipboard(fullAddress)
    render(ok ? 'Copied' : 'Select and copy', fullAddress)
    setTimeout(() => banner.remove(), 1500)
  })
  document.body.appendChild(banner)
  setTimeout(() => banner.remove(), 10000)
}

const fillInput = (element: HTMLElement | null, value: string) => {
  if (!element) return false

  const fullAddress = `${value}@duck.com`

  try {
    if (element.isContentEditable) {
      element.textContent = fullAddress
      return true
    }

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.value = fullAddress

      element.dispatchEvent(new Event('input', { bubbles: true }))
      element.dispatchEvent(new Event('change', { bubbles: true }))

      return true
    }
  } catch {
    return false
  }

  return false
}

api.runtime.onMessage.addListener((message, _sender) => {
  if (!extensionAlive()) return false

  if (message.type === 'fill-address') {
    const fullAddress = `${message.address}@duck.com`

    if (SAFARI) {
      showCopyBanner(fullAddress)
      return false
    }

    void (async () => {
      const activeElement = document.activeElement as HTMLElement | null
      const filled = fillInput(activeElement, message.address)
      const copied = await copyToClipboard(fullAddress)

      if (!filled) {
        showNotification(copied
          ? 'Could not fill input, address copied to clipboard'
          : 'Could not fill input or copy to clipboard. Please check permissions in settings.')
      } else {
        showNotification(copied
          ? 'Address filled and copied to clipboard'
          : 'Address filled but could not copy to clipboard. Please check permissions in settings.')
      }
    })()
    return false
  }

  if (message.type === 'show-notification') {
    showNotification(message.message)
    return false
  }

  return false
})

export {}