import { useState } from 'react';

export const useToggle = (initial = false) => {
  const [value, setValue] = useState(initial);
  return [value, () => setValue(!value)] as const;
};

export const Toggle = () => {
  const [on, toggle] = useToggle();
  return <button onClick={toggle}>{on ? 'sí' : 'no'}</button>;
};

const longSignature = (
  aVeryLongParameterNameThatKeepsGoing: string,
  anotherVeryLongParameterNameThatKeepsGoing: number,
  yetAnotherVeryLongParameterNameThatKeepsGoingAndGoing: boolean,
  oneMoreVeryLongParameterNameToPushTheSignaturePastTheLimit: string[],
  finalVeryLongParameterNameToBeSureWeExceedFourHundredCharacters: Record<string, unknown>,
): void => {};
export { longSignature };
