import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

const useScrollToElementById = (elementId) => {
  const element = document.getElementById(elementId);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (!elementId) return;

    const scrollToElement = () => {

      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Reset Scroll Attached
        searchParams.delete('element_id')
        const params = new URLSearchParams(searchParams.toString());
        params.delete('element_id');
        setSearchParams(params);
      }
    };

    scrollToElement();

  }, [elementId, element, searchParams, setSearchParams]);
};

export default useScrollToElementById;
