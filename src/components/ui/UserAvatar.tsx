import React from 'react';

type UserAvatarProps = {
  name?: string | null;
  imageUrl?: string | null;
  sizeClassName?: string;
  textClassName?: string;
};

function initialsFromName(name?: string | null) {
  const parts = (name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return 'U';
  }

  return parts.map((part) => part[0]?.toUpperCase() || '').join('');
}

export default function UserAvatar({
  name,
  imageUrl,
  sizeClassName = 'w-10 h-10',
  textClassName = 'text-sm',
}: UserAvatarProps) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name ? `${name} profile photo` : 'Profile photo'}
        className={`${sizeClassName} rounded-full object-cover border border-white/60 shadow-sm`}
      />
    );
  }

  return (
    <div className={`${sizeClassName} rounded-full bg-[#6b8e6b] text-white flex items-center justify-center font-bold ${textClassName}`}>
      {initialsFromName(name)}
    </div>
  );
}
