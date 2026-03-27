import type { Schema, Struct } from '@strapi/strapi';

export interface SharedMedia extends Struct.ComponentSchema {
  collectionName: 'components_shared_media';
  info: {
    displayName: 'Media';
    icon: 'file-video';
  };
  attributes: {
    file: Schema.Attribute.Media<'images' | 'files' | 'videos'>;
  };
}

export interface SharedQuote extends Struct.ComponentSchema {
  collectionName: 'components_shared_quotes';
  info: {
    displayName: 'Quote';
    icon: 'indent';
  };
  attributes: {
    body: Schema.Attribute.Text;
    title: Schema.Attribute.String;
  };
}

export interface SharedRichText extends Struct.ComponentSchema {
  collectionName: 'components_shared_rich_texts';
  info: {
    description: '';
    displayName: 'Rich text';
    icon: 'align-justify';
  };
  attributes: {
    body: Schema.Attribute.RichText;
  };
}

export interface SharedSeo extends Struct.ComponentSchema {
  collectionName: 'components_shared_seos';
  info: {
    description: '';
    displayName: 'Seo';
    icon: 'allergies';
    name: 'Seo';
  };
  attributes: {
    metaDescription: Schema.Attribute.Text & Schema.Attribute.Required;
    metaTitle: Schema.Attribute.String & Schema.Attribute.Required;
    shareImage: Schema.Attribute.Media<'images'>;
  };
}

export interface SharedSlider extends Struct.ComponentSchema {
  collectionName: 'components_shared_sliders';
  info: {
    description: '';
    displayName: 'Slider';
    icon: 'address-book';
  };
  attributes: {
    files: Schema.Attribute.Media<'images', true>;
  };
}

export interface SharedSpecifications extends Struct.ComponentSchema {
  collectionName: 'components_shared_specifications';
  info: {
    displayName: 'specifications';
  };
  attributes: {
    class: Schema.Attribute.String;
    color: Schema.Attribute.String;
    cooling_energy_class: Schema.Attribute.String;
    cooling_operating_range: Schema.Attribute.String;
    cooling_power: Schema.Attribute.String;
    cop_heating: Schema.Attribute.String;
    country_of_origin: Schema.Attribute.String;
    eer_cooling: Schema.Attribute.String;
    heating_energy_class: Schema.Attribute.String;
    heating_operating_range: Schema.Attribute.String;
    heating_power: Schema.Attribute.String;
    indoor_noise_level: Schema.Attribute.String;
    indoor_unit_dimensions: Schema.Attribute.String;
    indoor_unit_weight: Schema.Attribute.String;
    max_height_difference: Schema.Attribute.String;
    max_pipe_length: Schema.Attribute.String;
    outdoor_noise_level: Schema.Attribute.String;
    outdoor_unit_dimensions: Schema.Attribute.String;
    outdoor_unit_weight: Schema.Attribute.String;
    pipe_diameter: Schema.Attribute.String;
    power_btu: Schema.Attribute.String;
    power_consumption_cooling: Schema.Attribute.String;
    power_consumption_heating: Schema.Attribute.String;
    power_supply_location: Schema.Attribute.String;
    power_supply_voltage: Schema.Attribute.String;
    recommended_cooling_volume: Schema.Attribute.String;
    recommended_heating_volume: Schema.Attribute.String;
    refrigerant: Schema.Attribute.String;
    room_size: Schema.Attribute.String;
    scop: Schema.Attribute.String;
    seer: Schema.Attribute.String;
    wifi_control: Schema.Attribute.String;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'shared.media': SharedMedia;
      'shared.quote': SharedQuote;
      'shared.rich-text': SharedRichText;
      'shared.seo': SharedSeo;
      'shared.slider': SharedSlider;
      'shared.specifications': SharedSpecifications;
    }
  }
}
