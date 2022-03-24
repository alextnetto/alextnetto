import type { NextPage } from "next";
import Head from "next/head";
import Image from "next/image";
import styles from "../styles/Home.module.css";

const Home: NextPage = () => {
  const logoSize = 40;
  return (
    <div className={styles.container}>
      <Head>
        <title>Alextnetto - Web3 Builder</title>
        <meta
          name="description"
          content="Always contributing and learning with the community"
        />
        <link rel="icon" href="/favicon.png" />
      </Head>

      <main className={styles.main}>
        <h1 className={styles.title}>
          <code className={styles.code}>
            Hello world, I&apos;m <a>Alex</a>
          </code>
        </h1>

        <div className={styles.grid}>
          <a href="/cv" className={styles.card}>
            <h2>About me &rarr;</h2>
            <p>Experience, work, acomplishments and life</p>
          </a>
        </div>
      </main>

      <footer className={styles.footer}>
        <a
          href="https://github.com/Alextnetto"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className={styles.logo}>
            <Image
              src="/assets/github.svg"
              alt="Github Logo"
              width={logoSize}
              height={logoSize}
            />
          </span>
        </a>
        <a
          href="https://www.linkedin.com/in/alextnetto/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className={styles.logo}>
            <Image
              src="/assets/linkedin.svg"
              alt="LinkedIn Logo"
              width={logoSize}
              height={logoSize}
            />
          </span>
        </a>
        <a
          href="https://medium.com/@alextnetto"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className={styles.logo}>
            <Image
              src="/assets/medium.svg"
              alt="Medium Logo"
              width={logoSize}
              height={logoSize}
            />
          </span>
        </a>
        <a
          href="https://twitter.com/alextnetto"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className={styles.logo}>
            <Image
              src="/assets/twitter.svg"
              alt="Twitter Logo"
              width={logoSize}
              height={logoSize}
            />
          </span>
        </a>
      </footer>
    </div>
  );
};

export default Home;
