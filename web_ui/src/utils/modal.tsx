import React from "react"
import { createRoot } from "react-dom/client"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

let modalContainer: HTMLElement | null = null

const createModalContainer = () => {
  if (!modalContainer) {
    modalContainer = document.createElement("div")
    document.body.appendChild(modalContainer)
  }
  return modalContainer
}

export const Modal = {
  confirm: (options: {
    title?: string
    content?: React.ReactNode
    onOk?: () => void | Promise<void>
    onCancel?: () => void
    okText?: string
    cancelText?: string
  }) => {
    const container = createModalContainer()
    let isOpen = true

    const handleClose = () => {
      isOpen = false
      if (container && container.parentNode) {
        container.parentNode.removeChild(container)
      }
    }

    const handleOk = async () => {
      if (options.onOk) {
        await options.onOk()
      }
      handleClose()
    }

    const handleCancel = () => {
      if (options.onCancel) {
        options.onCancel()
      }
      handleClose()
    }

    const root = createRoot(container)
    root.render(
      <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{options.title || "确认"}</DialogTitle>
            {options.content && (
              <DialogDescription>{options.content}</DialogDescription>
            )}
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              {options.cancelText || "取消"}
            </Button>
            <Button onClick={handleOk}>
              {options.okText || "确认"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  },
}
