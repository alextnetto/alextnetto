import type { NextPage } from "next";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import styles from "../styles/Home.module.css";

const Home: NextPage = () => {
  const logoSize = 40;
  const ytLogoSize = 23;
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

        <iframe
          width="560"
          height="315"
          src="https://www.youtube.com/embed/k3q7r7_iIyM"
          title="YouTube video player"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        ></iframe>

        <div className={styles.grid}>
          <Link href="https://www.youtube.com/channel/UCvnZB9Tim1kidK7Fhy33AWg">
            <a className={styles.card}>
              <h2>YouTube &rarr;</h2>
              <p>Blockchain, Solidity, Smart Contracts</p>
            </a>
          </Link>
          <Link href="/cv">
            <a className={styles.card}>
              <h2>About me &rarr;</h2>
              <p>Experience, work, accomplishments and life</p>
            </a>
          </Link>
          <Link href="/obvius-crypto">
            <a className={styles.card}>
              <h2>Obvius Crypto &rarr;</h2>
              <p>
                The winning solution of Ethereum Rio Hackathon, that I
                participated coding Smart Contracts
              </p>
            </a>
          </Link>
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
