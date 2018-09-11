import * as React from "react";
import { Button } from "react-bootstrap";
import { Link } from "react-router-dom";
import styled from "styled-components";

import { Auth } from "../../auth";

const HeaderContainer = styled.div`
  align-items: center;
  background-color: #137a9a;
  display: flex;
  justify-content: space-between;
  padding: 20px;
  margin: 0 0 20px 0;
  color: #fff;
`;

const headerLinkStyle = `
  color: #fff;

  &:hover,
  &:active,
  &:visited {
    color: #fff;
  }
`;

const BrandLink = styled(Link)`
  ${headerLinkStyle};
  font-weight: bold;
`;

const HeaderA = styled.a`
  ${headerLinkStyle};
`;

const UserControlsContainer = styled.div`
  align-items: center;
  display: flex;
  justify-content: space-between;
`;

const Brand = () => (
  <div className="Brand">
    <BrandLink to="/">Mosaic v0.1</BrandLink>
  </div>
);

const ActionLink = ({ action, children }) => (
  <HeaderA
    href="#"
    onClick={e => {
      action();
      e.preventDefault();
    }}
  >
    {children}
  </HeaderA>
);

const LogoutLink = () => (
  <ActionLink
    action={() => {
      Auth.logout();
      location.reload(); // HACK
    }}
  >
    Log out
  </ActionLink>
);

const LoginLink = () => (
  <ActionLink
    action={() => {
      Auth.login();
    }}
  >
    Log in
  </ActionLink>
);

const UserControls = () => (
  Auth.isAuthenticated()
  ?
  <UserControlsContainer>
    <Link to="/current" style={{ marginRight: '30px' }}>
      <Button bsSize="xsmall">Your Current Workspace</Button>
    </Link>
    <Link to="/next" style={{ marginRight: '30px' }}>
      <Button bsSize="xsmall">Get Next Workspace</Button>
    </Link>
    <LogoutLink />
  </UserControlsContainer>
  :
  <LoginLink />
);

const Header = () => (
  <HeaderContainer>
    <Brand />
    <UserControls />
  </HeaderContainer>
);

export { Header };
