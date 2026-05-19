import { useState } from 'react';
import { getERPImageUrl } from '../../utils/erpLinks';

/**
 * User profile image or initial — ERP `user_image` when set.
 */
export default function UserAvatar({
  user,
  size = 'md',
  className = '',
  title,
}) {
  const name = user?.full_name || user?.name || 'User';
  const initial = name?.[0]?.toUpperCase() || 'U';
  const src = getERPImageUrl(user?.user_image);
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = Boolean(src) && !imgFailed;

  return (
    <span
      className={`user-avatar user-avatar--${size} ${className}`.trim()}
      title={title || name}
      aria-hidden={!showImage}
    >
      {showImage ? (
        <img
          className="user-avatar__img"
          src={src}
          alt=""
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span className="user-avatar__initial" aria-hidden>
          {initial}
        </span>
      )}
    </span>
  );
}
