export const formatPrice = (price: number): string => {
  return `KES ${price.toLocaleString('en-KE')}`;
};

export const calculateDiscount = (original: number, current: number): number => {
  return Math.round(((original - current) / original) * 100);
};
