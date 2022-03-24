import type { NextPage } from "next";
import Head from "next/head";
import { useEffect, useState } from "react";

const MyCv: NextPage = () => {
  const [windowSize, setWindowSize] = useState({
    width: 0,
    height: 0,
  });

  function handleResize() {
    setWindowSize({
      width: window.innerWidth,
      height: window.innerHeight,
    });
  }

  useEffect(() => {
    window.addEventListener("resize", handleResize);

    handleResize();

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div>
      <Head>
        <title>Alextnetto - Web3 Builder</title>
        <meta
          name="description"
          content="Always contributing and learning with the community"
        />
        <link rel="icon" href="/favicon.png" />
      </Head>
      <iframe
        src="https://docs.google.com/presentation/d/e/2PACX-1vRIZWhO1jWZUENOkKjziECVUTdG_yziQqgglxOEfWgfl2hsT9tFZfsWVzTistkEPA/embed?start=false&loop=false&delayms=60000"
        frameBorder="0"
        width={windowSize.width}
        height={windowSize.height}
        allowFullScreen={true}
      ></iframe>
    </div>
  );
};

export default MyCv;
