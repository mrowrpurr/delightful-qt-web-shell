import type { Meta, StoryObj } from '@storybook/react-vite'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from './select'

const meta = {
  title: 'UI/Select',
  component: Select,
} satisfies Meta<typeof Select>

export default meta

export const Default = {
  render: () => (
    <Select defaultValue="readme">
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="Choose a doc..." />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="readme">README</SelectItem>
        <SelectItem value="architecture">Architecture</SelectItem>
        <SelectItem value="tutorial">Tutorial</SelectItem>
        <SelectItem value="testing">Testing</SelectItem>
      </SelectContent>
    </Select>
  ),
}
