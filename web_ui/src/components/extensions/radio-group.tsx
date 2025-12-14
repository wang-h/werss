import * as React from "react"
import { RadioGroup as BaseRadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Button } from "@/components/ui/button"
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

const radioGroupVariants = cva("", {
  variants: {
    type: {
      default: "grid gap-2",
      button: "inline-flex gap-1"
    },
    size: {
      default: "",
      small: "text-sm"
    }
  },
  defaultVariants: {
    type: "default",
    size: "default"
  }
})

interface RadioGroupProps extends React.ComponentProps<typeof BaseRadioGroup> {
  type?: "default" | "button"
  size?: "default" | "small"
}

const RadioGroup = React.forwardRef<
  React.ElementRef<typeof BaseRadioGroup>,
  RadioGroupProps
>(({ className, type = "default", size = "default", ...props }, ref) => {
  return (
    <BaseRadioGroup
      className={cn(radioGroupVariants({ type, size }), className)}
      {...props}
      ref={ref}
    />
  )
})
RadioGroup.displayName = "RadioGroup"

interface RadioGroupItemProps extends React.ComponentProps<typeof RadioGroupItem> {
  button?: boolean
  size?: "default" | "small"
}

const RadioGroupItemWithButton = React.forwardRef<
  React.ElementRef<typeof RadioGroupItem>,
  RadioGroupItemProps
>(({ className, button, size = "default", children, ...props }, ref) => {
  if (button) {
    return (
      <RadioGroupItem
        ref={ref}
        asChild
        {...props}
      >
        <Button
          type="button"
          variant={props.value === props.defaultValue || props.checked ? "default" : "outline"}
          size={size === "small" ? "sm" : "default"}
          className={cn(className)}
        >
          {children}
        </Button>
      </RadioGroupItem>
    )
  }
  
  return (
    <RadioGroupItem
      ref={ref}
      className={cn(className)}
      {...props}
    >
      {children}
    </RadioGroupItem>
  )
})
RadioGroupItemWithButton.displayName = "RadioGroupItemWithButton"

// Radio component for compatibility
const Radio = React.forwardRef<
  React.ElementRef<typeof RadioGroupItem>,
  RadioGroupItemProps & {
    value: string | number
  }
>(({ children, ...props }, ref) => {
  return (
    <RadioGroupItemWithButton ref={ref} {...props}>
      {children}
    </RadioGroupItemWithButton>
  )
})
Radio.displayName = "Radio"

export { RadioGroup, RadioGroupItemWithButton as RadioGroupItem, Radio }

