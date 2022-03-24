import type { NextPage } from "next";
import Head from "next/head";
import { useEffect, useState } from "react";

const MyCv: NextPage = () => {
  const size = useWindowSize();

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
        width={size.width}
        height={size.height}
        allowFullScreen={true}
        mozallowfullscreen="true"
        webkitallowfullscreen="true"
      ></iframe>
    </div>
  );
};

// Hook
function useWindowSize() {
  // Initialize state with undefined width/height so server and client renders match
  // Learn more here: https://joshwcomeau.com/react/the-perils-of-rehydration/
  const [windowSize, setWindowSize] = useState({
    width: undefined,
    height: undefined,
  });

  useEffect(() => {
    // only execute all the code below in client side
    if (typeof window !== "undefined") {
      // Handler to call on window resize
      function handleResize() {
        // Set window width/height to state
        setWindowSize({
          width: window.innerWidth,
          height: window.innerHeight,
        });
      }

      window.addEventListener("resize", handleResize);

      handleResize();

      return () => window.removeEventListener("resize", handleResize);
    }
  }, []);
  return windowSize;
}

export default MyCv;
