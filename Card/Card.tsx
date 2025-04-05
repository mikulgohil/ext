import React from 'react';

// TypeScript interface for the Card component props
export interface CardProps {
  title: string;
  description: string;
  ctaText: string;
  onCtaClick: () => void;
  theme: 'light' | 'dark';
}

// Card component definition
export const Card: React.FC<CardProps> = ({ title, description, ctaText, onCtaClick, theme }) => {
  return (
    <div className={`max-w-sm mx-auto p-6 rounded-lg shadow-md ${theme === 'dark' ? 'bg-gray-800 text-white' : 'bg-white text-gray-800'}`}>
      {/* Card Title */}
      <h2 className="text-xl font-semibold mb-2">{title}</h2>
      
      {/* Card Description */}
      <p className="text-sm mb-4">{description}</p>
      
      {/* Call-to-Action Button */}
      <button
        onClick={onCtaClick}
        className={`py-2 px-4 rounded ${theme === 'dark' ? 'bg-blue-500 hover:bg-blue-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
      >
        {ctaText}
      </button>
    </div>
  );
};

// Default export
export default Card;
