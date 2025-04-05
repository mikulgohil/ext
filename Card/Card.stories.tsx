import React from 'react';
import { Meta, StoryObj } from '@storybook/react';
import Card from './index';
import { mockCardData, alternativeCardData } from './Card.mock';

const meta: Meta<typeof Card> = {
  title: 'Components/Card',
  component: Card,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  args: {
    ...mockCardData
  },
};

export const Variant: Story = {
  args: {
    ...alternativeCardData
  },
};
