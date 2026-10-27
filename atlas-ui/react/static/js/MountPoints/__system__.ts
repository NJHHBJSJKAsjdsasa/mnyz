// atlas-ui/react/static/js/MountPoints/__system__.ts
import React from 'react';
import { createRoot } from 'react-dom/client';
import SystemLayout from '../Layouts/__system__.tsx';

interface SystemProps {
  system: {
    name: string;
    index: number;
    star_system_type: string;
    num_planets: number;
    stars: Array<{
      Type: string;
      Size: string;
      Color: string;
    }>;
    // Planets arrive from the server payload; the layout consumes the full shape.
    planets: any[];
  };
  galaxy: {
    name: string;
    coordinates: number[];
  };
  system_url: string;
  version: string;
  system_index: number;
  image_url?: string;
  page: number;
  cosmic_origin_time: number;
}

document.addEventListener('DOMContentLoaded', async () => {
  
  try {
    const systemDataElement = document.getElementById('system-data');
    const galaxyDataElement = document.getElementById('galaxy-data');
    const metaDataElement = document.getElementById('meta-data');
    
    if (!systemDataElement || !galaxyDataElement || !metaDataElement) {
      return;
    }

    const systemData = JSON.parse(systemDataElement.textContent || '{}');
    const galaxyData = JSON.parse(galaxyDataElement.textContent || '{}');
    const metaData = JSON.parse(metaDataElement.textContent || '{}');

    const props: SystemProps = {
      system: systemData,
      galaxy: galaxyData,
      system_url: metaData.system_url,
      version: metaData.version,
      system_index: metaData.system_index,
      image_url: metaData.image_url,
      page: metaData.page || 1,
      cosmic_origin_time: metaData.cosmic_origin_time
    };

    const container = document.getElementById('atlas-react-root');
    if (container) {
      const root = createRoot(container);
      root.render(React.createElement(SystemLayout, props));
    }
  } catch (error) {
  }
});