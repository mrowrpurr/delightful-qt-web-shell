import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Select, type SelectProps } from './select'

const meta = {
  title: 'UI/Select',
  component: Select,
} satisfies Meta<typeof Select>

export default meta
type Story = StoryObj<typeof meta>

const options = [
  { value: 'readme', label: 'README' },
  { value: 'architecture', label: 'Architecture' },
  { value: 'tutorial', label: 'Tutorial' },
  { value: 'testing', label: 'Testing' },
]

export const Default: Story = {
  args: { value: 'readme', onChange: () => {}, options },
  render: (args) => {
    const [value, setValue] = useState(args.value)
    return <Select {...args} value={value} onChange={setValue} className="w-[200px]" />
  },
}

export const WithPlaceholder: Story = {
  args: { value: '', onChange: () => {}, options, placeholder: 'Choose a doc...' },
  render: (args) => {
    const [value, setValue] = useState(args.value)
    return <Select {...args} value={value} onChange={setValue} className="w-[200px]" />
  },
}
