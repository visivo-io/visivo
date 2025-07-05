import { useState } from "react"
import copy from "copy-to-clipboard"

export const useCopyToClipboard = () => {
  const [toolTip, setToolTip] = useState('Copy')

  const copyText = (text) => {
    const isCopied = copy(text)
    if (isCopied) {
      setToolTip('Copied')
    } else {
      setToolTip('Copy')
    }
  }

  const resetToolTip = () => setToolTip('Copy')

  return { toolTip, copyText, resetToolTip }
}