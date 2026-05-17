import React from 'react'
import styled from 'styled-components'

// Plain colors instead of theme tokens — if the error is thrown by the
// ThemeProvider's children, the theme might be unavailable here, so anything
// reading from props.theme would itself throw and the boundary would render
// blank. Hard-coded colors guarantee the message stays visible.

const ErrorContainer = styled.div`
  display: flex;
  flex-direction: column;
  padding: 20px;
  background: #fff;
  color: #111;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  width: 400px;
  box-sizing: border-box;
`

const ErrorTitle = styled.h2`
  font-size: 16px;
  font-weight: 700;
  margin: 0 0 12px;
`

const ErrorPre = styled.pre`
  background: #f3f3f3;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 10px;
  font-size: 12px;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-all;
  user-select: text;
  max-height: 240px;
  overflow: auto;
  margin: 0 0 12px;
`

const Row = styled.div`
  display: flex;
  gap: 8px;
`

const Btn = styled.button`
  flex: 1;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid #999;
  background: #f6f6f6;
  color: #111;
  font-size: 13px;
  cursor: pointer;
`

interface State {
  hasError: boolean
  message?: string
  stack?: string
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message, stack: error?.stack }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Qwacky error boundary:', error, info)
    this.setState({ stack: `${error?.stack ?? ''}\n\nReact component stack:${info?.componentStack ?? ''}` })
  }

  render() {
    if (this.state.hasError) {
      const text = `${this.state.message ?? 'Unknown error'}\n\n${this.state.stack ?? ''}`
      return (
        <ErrorContainer>
          <ErrorTitle>Qwacky crashed</ErrorTitle>
          <ErrorPre>{text}</ErrorPre>
          <Row>
            <Btn onClick={() => navigator.clipboard?.writeText(text).catch(() => {})}>Copy</Btn>
            <Btn onClick={() => window.location.reload()}>Reload</Btn>
          </Row>
        </ErrorContainer>
      )
    }
    return this.props.children
  }
}
