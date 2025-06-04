import React from 'react';

interface AudioVisualizerProps {
  audioLevel: number;
  label?: string;
  color?: 'blue' | 'green' | 'purple';
  height?: 'sm' | 'md' | 'lg';
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  audioLevel,
  label,
  color = 'blue',
  height = 'md',
}) => {
  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    purple: 'bg-purple-500',
  };

  const heightClasses = {
    sm: 'h-2',
    md: 'h-3',
    lg: 'h-4',
  };

  return (
    <div className="w-full">
      {label && (
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">{label}</p>
      )}
      <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`${colorClasses[color]} ${heightClasses[height]} transition-all duration-75 ease-out`}
          style={{ width: `${Math.min(100, (audioLevel / 128) * 100)}%` }}
        />
      </div>
    </div>
  );
};