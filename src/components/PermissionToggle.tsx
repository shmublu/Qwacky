import React, { useState, useEffect, useCallback, useRef } from 'react'
import { usePermissions, PERMISSIONS } from '../context/PermissionContext'
import { ConfirmDialog } from './ConfirmDialog'
import Markdown from 'react-markdown'
import {
  ToggleContainer,
  ToggleHeader,
  ToggleTitle,
  ToggleSwitch,
  ToggleInput,
  ToggleSlider,
  ToggleDescription,
  BrowserSpecificInfo,
  StatusMessage,
  InfoIcon,
  Tooltip,
  InfoIconContainer,
  LinkText,
  NoticeContainer,
  NoticeParagraph
} from '../styles/ui.styles'

declare const browser: typeof chrome
const api = typeof browser !== 'undefined' ? browser : chrome

const isSafari = process.env.BROWSER === 'safari'
const isFirefox = !isSafari && navigator.userAgent.toLowerCase().includes('firefox')

const CHROME_PERMISSION_NOTICE_SEEN = 'chromePermissionNoticeSeen'

interface PermissionToggleProps {
  name: string
  description: string
  isEnabled: boolean
  onChange: (enabled: boolean) => void
  disabled?: boolean
}

export const PermissionToggle: React.FC<PermissionToggleProps> = ({
  name,
  description,
  isEnabled,
  onChange,
  disabled = false
}) => {
  const [status, setStatus] = useState<{ message: string; type: 'info' | 'error' | 'success' } | null>(null)
  const [showPermissionsNotice, setShowPermissionsNotice] = useState(false)
  const [showChromeNotice, setShowChromeNotice] = useState(false)
  const [chromeNoticeSeen, setChromeNoticeSeen] = useState(false)
  const { requestPermissions, removePermissions, checkPermission } = usePermissions()
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const tooltipTimeoutRef = useRef<number | null>(null);

  const permissionType = Object.entries(PERMISSIONS).find(
    ([_, permission]) => permission.name === name
  )?.[0] as keyof typeof PERMISSIONS | undefined;

  const isRequired = permissionType ? PERMISSIONS[permissionType]?.isRequired : false;

  const browserSpecificInfo = permissionType && PERMISSIONS[permissionType]?.browserSpecificInfo
    ? isFirefox
      ? PERMISSIONS[permissionType].browserSpecificInfo?.firefox
      : PERMISSIONS[permissionType].browserSpecificInfo?.chrome
    : undefined;

  const showTooltip = () => {
    if (tooltipTimeoutRef.current) {
      window.clearTimeout(tooltipTimeoutRef.current);
      tooltipTimeoutRef.current = null;
    }
    setTooltipVisible(true);
  };

  const hideTooltip = () => {
    tooltipTimeoutRef.current = window.setTimeout(() => {
      setTooltipVisible(false);
    }, 2000);
  };

  useEffect(() => {
    return () => {
      if (tooltipTimeoutRef.current) {
        window.clearTimeout(tooltipTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isFirefox) {
      const checkChromeNoticeSeen = async () => {
        try {
          const result = await api.storage.local.get(CHROME_PERMISSION_NOTICE_SEEN)
          setChromeNoticeSeen(Boolean(result[CHROME_PERMISSION_NOTICE_SEEN]))
        } catch (err) {
          console.error('Error checking Chrome notice status:', err)
        }
      }

      checkChromeNoticeSeen()
    }
  }, [])

  useEffect(() => {
    if (status) {
      const timer = setTimeout(() => setStatus(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [status])

  // Call requestPermissions FIRST inside the dialog's click handler. Safari only
  // honors permissions.request() when it's reached directly from a user gesture,
  // so any setState / storage write before the request silently drops the prompt.
  const handleNoticeDone = useCallback(() => {
    const grant = requestPermissions('contextMenuFeatures')
    setShowPermissionsNotice(false)
    grant.catch(err => console.error('Error requesting permissions:', err))
  }, [requestPermissions])

  const handleChromeNoticeDone = useCallback(() => {
    const grant = requestPermissions('contextMenuFeatures')
    setShowChromeNotice(false)
    setChromeNoticeSeen(true)
    void api.storage.local.set({ [CHROME_PERMISSION_NOTICE_SEEN]: true })
    grant.catch(err => console.error('Error requesting permissions:', err))
  }, [requestPermissions])

  // Safari requires that permissions.request() runs directly from a user gesture
  // with no prior awaits — so on Safari we kick the request off synchronously
  // from the checkbox change, then complete the toggle in a follow-up.
  const finishEnable = useCallback(async () => {
    try {
      const response = await api.runtime.sendMessage({ action: 'toggleFeature', enabled: true })
      if (response?.success) {
        onChange(true)
      } else {
        setStatus({ message: 'Failed to enable feature', type: 'error' })
        onChange(false)
      }
    } catch (error) {
      console.error('Toggle enable error:', error)
      setStatus({ message: 'An error occurred', type: 'error' })
      onChange(false)
    }
  }, [onChange])

  const disableFeature = useCallback(async () => {
    setStatus({ message: `Disabling ${name}...`, type: 'info' })
    try {
      const response = await api.runtime.sendMessage({ action: 'toggleFeature', enabled: false })
      if (response?.success) {
        await removePermissions('contextMenuFeatures')
        onChange(false)
      } else {
        setStatus({ message: 'Failed to disable feature', type: 'error' })
        onChange(true)
      }
    } catch (error) {
      console.error('Toggle disable error:', error)
      setStatus({ message: 'An error occurred', type: 'error' })
      onChange(true)
    }
  }, [name, onChange, removePermissions])

  const handleToggle = useCallback((newState: boolean) => {
    if (disabled || isRequired) return

    if (!newState) {
      void disableFeature()
      return
    }

    if (isSafari) {
      // Fire the permission request from the gesture, then enable in a follow-up.
      const grant = requestPermissions('contextMenuFeatures')
      grant
        .then(granted => {
          if (!granted) {
            setStatus({ message: 'Permission request was denied', type: 'error' })
            onChange(false)
            return
          }
          return finishEnable()
        })
        .catch(error => {
          console.error('Toggle error:', error)
          setStatus({ message: 'An error occurred', type: 'error' })
          onChange(false)
        })
      return
    }

    void (async () => {
      try {
        const hasPermission = await checkPermission('contextMenuFeatures')
        if (!hasPermission) {
          if (isFirefox) {
            setShowPermissionsNotice(true)
            return
          }
          if (!chromeNoticeSeen) {
            setShowChromeNotice(true)
            return
          }
          const granted = await requestPermissions('contextMenuFeatures')
          if (!granted) {
            setStatus({ message: 'Permission request was denied', type: 'error' })
            onChange(false)
            return
          }
        }
        await finishEnable()
      } catch (error) {
        console.error('Toggle error:', error)
        setStatus({ message: 'An error occurred', type: 'error' })
        onChange(!newState)
      }
    })()
  }, [disabled, isRequired, onChange, checkPermission, requestPermissions, chromeNoticeSeen, disableFeature, finishEnable])

  const FirefoxPermissionNotice = () => (
    <NoticeContainer>
      <NoticeParagraph>To enable this feature:</NoticeParagraph>
      <NoticeParagraph>1. Firefox will show a permissions request - click 'Allow'</NoticeParagraph>
      <NoticeParagraph>2. Return to the extension and toggle the feature again</NoticeParagraph>
      <NoticeParagraph>You can disable this feature anytime later.</NoticeParagraph>
    </NoticeContainer>
  );

  const ChromePermissionNotice = () => (
    <NoticeContainer>
      <NoticeParagraph>Chrome handles permissions differently than Firefox.</NoticeParagraph>
      <NoticeParagraph>To enable this feature, Chrome will show a permission request once. After clicking 'Done', a permissions dialog may appear.</NoticeParagraph>
      <NoticeParagraph>If you see a permissions dialog, click 'Allow' then return to the extension and toggle the feature again.</NoticeParagraph>
      <NoticeParagraph>For more details, see: <LinkText
          href="https://github.com/Lanshuns/Qwacky?tab=readme-ov-file#browser-specific-permission-handling-and-limitations"
          target="_blank"
          rel="noopener noreferrer"
        >
          Browser-Specific Permission Handling and Limitations
        </LinkText>
      </NoticeParagraph>
    </NoticeContainer>
  );

  return (
    <ToggleContainer disabled={disabled && !isRequired}>
      <ToggleHeader>
        <ToggleTitle>
          {name}
          {!isFirefox && name === "Autofill" && (
            <InfoIconContainer
              onMouseEnter={showTooltip}
              onMouseLeave={hideTooltip}
              onClick={showTooltip}
            >
              <InfoIcon size={16} />
              <Tooltip
                style={{
                  opacity: tooltipVisible ? 1 : 0,
                  visibility: tooltipVisible ? 'visible' : 'hidden'
                }}
                onMouseEnter={showTooltip}
                onMouseLeave={hideTooltip}
              >
                Browser additional permissions request will only appear once if not already granted.{' '}
                <LinkText
                  href="https://github.com/Lanshuns/Qwacky?tab=readme-ov-file#browser-specific-permission-handling-and-limitations"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Read More
                </LinkText>
              </Tooltip>
            </InfoIconContainer>
          )}
        </ToggleTitle>
        <ToggleSwitch>
          <ToggleInput
            type="checkbox"
            checked={isEnabled}
            onChange={e => handleToggle(e.target.checked)}
            disabled={disabled || isRequired}
          />
          <ToggleSlider />
        </ToggleSwitch>
      </ToggleHeader>
      <ToggleDescription>
        <Markdown>{description}</Markdown>
      </ToggleDescription>

      {browserSpecificInfo && (
        <BrowserSpecificInfo>
          <Markdown>{browserSpecificInfo}</Markdown>
        </BrowserSpecificInfo>
      )}

      {status && (
        <StatusMessage type={status.type}>
          {status.message}
        </StatusMessage>
      )}
      <ConfirmDialog
        isOpen={showPermissionsNotice}
        title="Permissions Notice"
        message={<FirefoxPermissionNotice />}
        confirmLabel="Done"
        onConfirm={handleNoticeDone}
        singleButton={true}
        variant="info"
      />
      <ConfirmDialog
        isOpen={showChromeNotice}
        title="Permissions Notice"
        message={<ChromePermissionNotice />}
        confirmLabel="Done"
        onConfirm={handleChromeNoticeDone}
        singleButton={true}
        variant="info"
      />
    </ToggleContainer>
  )
}
