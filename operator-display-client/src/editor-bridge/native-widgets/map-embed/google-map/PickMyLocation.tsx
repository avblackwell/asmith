import React from "react";
import styled from "styled-components";


const Icon = styled.button<{
  allowZoom?: boolean;
}>`
  background: white;
  width: 40px;
  height: 40px;
  border-radius: 2px;
  display: flex;
  justify-content: center;
  align-items: center;
  box-shadow: rgba(0, 0, 0, 0.3) 0px 1px 4px -1px;
  right: 10px;
  bottom: ${(props) => (props.allowZoom ? "110px" : "20px")};
  position: absolute;
  border: 0;
  cursor: pointer;
`;

interface PickMyLocationProps {
  title?: string;
  isEnabled?: boolean;
  allowZoom?: boolean;
  updateCenter: (lat: number, long: number) => void;
}

const PickMyLocation: React.FC<PickMyLocationProps> = (props) => {
  const { allowZoom, isEnabled, title, updateCenter } = props;
  const [clicked, setClicked] = React.useState(false);
  const [selected, setSelected] = React.useState(false);

  /**
   * get user location
   *
   * @returns
   */
  const getUserLocation = () => {
    if ("geolocation" in navigator) {
      return navigator.geolocation.getCurrentPosition((data) => {
        const {
          coords: { latitude: lat, longitude: long },
        } = data;

        setSelected(true);
        updateCenter(lat, long);
      });
    }
  };

  if (!isEnabled) return null;

  return (
    <Icon
      allowZoom={allowZoom}
      color={selected ? "#049ADA" : clicked ? "#666666" : "#999999"}
      onClick={() => {
        if (!(clicked && selected)) {
          setClicked(true);
          getUserLocation();
        }
      }}
      title={title}
      type="button"
    ><svg aria-hidden="true" width="24" height="24" fill="none" viewBox="0 0 24 24"><path fill="#049ADA" d="M12 8C9.79 8 8 9.79 8 12C8 14.21 9.79 16 12 16C14.21 16 16 14.21 16 12C16 9.79 14.21 8 12 8ZM20.94 11C20.48 6.83 17.17 3.52 13 3.06V1H11V3.06C6.83 3.52 3.52 6.83 3.06 11H1V13H3.06C3.52 17.17 6.83 20.48 11 20.94V23H13V20.94C17.17 20.48 20.48 17.17 20.94 13H23V11H20.94V11ZM12 19C8.13 19 5 15.87 5 12C5 8.13 8.13 5 12 5C15.87 5 19 8.13 19 12C19 15.87 15.87 19 12 19Z"/></svg></Icon>
  );
};

export default PickMyLocation;
