import { CardProps } from './Card';

/**
 * Mock data for Card component
 */
export const mockCardData: CardProps = {
  "title": "Card Title",
  "description": "This is a sample description for the component. It provides context about what this component does.",
  "ctaText": "Learn More",
  "onCtaClick": () => console.log("Card CTA clicked"),
  "theme": "light"
};

/**
 * Alternative mock data for Card component
 */
export const alternativeCardData: CardProps = {
  ...mockCardData,
  theme: "dark",
  ctaText: "View Details",
  title: "Alternative Card Title"
};
