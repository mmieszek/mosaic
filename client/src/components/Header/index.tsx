import * as React from "react";
import { Link } from "react-router-dom";
import styled from "styled-components";

import { Auth } from "../../auth";

import {
  brandFontColor,
  brandFontSize,
  brandFontWeight,
  headerBgColor,
  headerLinkFontColor,
  headerLinkFontSize
} from "../../styles";

const HeaderContainer = styled.div`
  background-color: ${headerBgColor};
  padding: 25px;
`;

const Brand = styled(Link)`
  color: ${brandFontColor};
  font-size: ${brandFontSize};
  font-weight: ${brandFontWeight};

  &:active,
  &:hover,
  &:focus {
    color: ${brandFontColor};
  }
`;

const HeaderLink = styled.a`
  color: ${headerLinkFontColor};
  font-size: ${headerLinkFontSize};

  &:hover,
  &:active,
  &:visited {
    color: ${headerLinkFontColor};
  }
`;

const ActionLink = ({ action, children, ...rest }) => (
  <HeaderLink
    href="#"
    onClick={e => {
      action();
      e.preventDefault();
    }}
    {...rest}
  >
    {children}
  </HeaderLink>
);

const LogoutLink = () => (
  <ActionLink
    action={() => {
      Auth.logout();
      location.reload(); // HACK
    }}
    data-cy="logout-link"
  >
    Log out
  </ActionLink>
);

const LoginLink = () => (
  <ActionLink
    action={() => {
      Auth.login();
    }}
    data-cy="login-link"
  >
    Log in
  </ActionLink>
);

const UserControls = () => (
  <div>{Auth.isAuthenticated() ? <LogoutLink /> : <LoginLink />}</div>
);

const Header = () => (
  <HeaderContainer>
    <div className="container">
      <div
        style={{
          alignContent: "center",
          display: "flex",
          justifyContent: "space-between",
          padding: "0 20px"
        }}
      >
        <Brand to="/">Mosaic v0.4</Brand>
        <UserControls />
      </div>
    </div>
  </HeaderContainer>
);

export { Header };
