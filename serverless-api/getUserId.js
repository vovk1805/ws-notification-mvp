exports.getUserId = (userAgent) => {
  if (userAgent.includes('Firefox')) {
    return 'Firefox';
  }

  if (userAgent.includes('Edg')) {
    return 'Edge';
  }

  if (userAgent.includes('Safari/605')) {
    return 'Safari';
  }

  return 'Chrome';
};
