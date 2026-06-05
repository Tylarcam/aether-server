import { useState, useEffect } from 'react';

export function useStorage(key, defaultValue, sync = true) {
  const [value, setValue] = useState(defaultValue);
  const storage = sync ? chrome.storage.sync : chrome.storage.local;

  useEffect(() => {
    // Load initial value
    storage.get([key], (result) => {
      if (result[key] !== undefined) {
        setValue(result[key]);
      }
    });

    // Listen for changes
    const listener = (changes, areaName) => {
      if (areaName === (sync ? 'sync' : 'local') && changes[key]) {
        setValue(changes[key].newValue);
      }
    };
    chrome.storage.onChanged.addListener(listener);

    return () => chrome.storage.onChanged.removeListener(listener);
  }, [key, sync]);

  const updateValue = (newValue) => {
    storage.set({ [key]: newValue });
    setValue(newValue);
  };

  return [value, updateValue];
}
