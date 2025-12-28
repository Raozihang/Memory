import React from 'react';
import LiquidGlass from 'liquid-glass-react';
import { cn } from '@/lib/utils';

interface GlassButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
  displacementScale?: number;
  blurAmount?: number;
  saturation?: number;
  aberrationIntensity?: number;
  elasticity?: number;
  cornerRadius?: number;
  padding?: string;
}

export function GlassButton({ 
  children, 
  onClick, 
  className, 
  style,
  displacementScale = 64,
  blurAmount = 0.1,
  saturation = 130,
  aberrationIntensity = 2,
  elasticity = 0.35,
  cornerRadius = 100,
  padding = "8px",
  ...props
}: GlassButtonProps) {
  return (
    <LiquidGlass
      displacementScale={displacementScale}
      blurAmount={blurAmount}
      saturation={saturation}
      aberrationIntensity={aberrationIntensity}
      elasticity={elasticity}
      cornerRadius={cornerRadius}
      padding={padding}
      onClick={onClick}
      className={cn("cursor-pointer transition-transform active:scale-95", className)}
      style={style}
      {...props}
    >
      {children}
    </LiquidGlass>
  );
}
