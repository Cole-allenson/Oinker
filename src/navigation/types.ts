export type RootStackParamList = {
  Login: undefined;
  Signup: undefined;
  MainTabs: undefined;
  RequestDelivery: {
    driver: {
      id: string;
      name: string;
      rating: number;
      rate_per_mile: number;
      latitude: number;
      longitude: number;
      distance?: number;
    };
  };
  DeliveryConfirmation: {
    order: {
      id: string;
      pickup_address: string;
      pickup_lat: number;
      pickup_lng: number;
      dropoff_address: string;
      dropoff_lat: number;
      dropoff_lng: number;
    };
  };
  Chat: {
    orderId: string;
    otherName: string;
  };
  SetupCard: undefined;
};

export type MainTabParamList = {
  Map: undefined;
  Orders: undefined;
  Inbox: undefined;
  Profile: undefined;
};
