"use client";

import React, { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Layer, Line, Stage } from "react-konva";
import { useWritable } from "react-use-svelte-store";
import { Region, regionStore, resetRegions } from "@/store";
import { ColorSelector } from "@/components/ColorSelector";
import { Header } from "@/components/header";
import Konva from "konva";
import { dataUrlToImageElement, fileToDataUrl } from "@/lib/utils";
import {
  generateBackgroundImage,
  generateImage,
  removeBackground,
} from "@/app/actions";
import { BgColor } from "@/lib/backgrounds";
import { ArrowUturnLeftIcon, SparklesIcon } from "@heroicons/react/16/solid";
import { FeatureCard } from "@/components/feature-card";
import { TransparentInput } from "@/components/ui/transparent-input";
import { GlowingButton } from "@/components/ui/glowing-button";
import { XIcon } from "lucide-react";
import { UploadButton } from "@/components/ui/upload-button";
import {
  LoginButton,
  SignedIn,
  SignedOut,
  IsAllowed,
  IsForbidden,
  PricingLink,
} from "@kobbleio/next/client";

function getRelativePointerPosition(node: Konva.Stage) {
  // the function will return pointer position relative to the passed node
  const transform = node.getAbsoluteTransform().copy();
  // to detect relative position we need to invert transform
  transform.invert();

  // get pointer (say mouse or touch) position
  const pos = node.getStage().getPointerPosition();

  if (!pos) {
    throw new Error("No position");
  }

  // now we find relative point
  return transform.point(pos);
}

export default function CanvasEditor() {
  const [isDragging, setIsDragging] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [inputValue, setInputValue] = useState<string>("");
  const [genBgInputValue, setGenBgInputValue] = useState<string>("");
  const [genImageInputValue, setGenImageINputValue] = useState<string>("");

  const genImageInputRef = useRef<HTMLInputElement>(null);
  const genBgInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const bgLayerRef = useRef<Konva.Layer>(null);
  const imageLayerRef = useRef<Konva.Layer>(null);

  const [regions, setRegions] = useWritable<Region[]>(regionStore);

  const [history, setHistory] = useState<string[]>([]);

  const [loadings, setLoadings] = useState<{
    removeBg: boolean;
    generateReplacement: boolean;
    generateBackground: boolean;
    exporting: boolean;
    generateImage: boolean;
  }>({
    removeBg: false,
    generateReplacement: false,
    generateBackground: false,
    exporting: false,
    generateImage: false,
  });

  const currentImage = useMemo(() => {
    return history[history.length - 1];
  }, [history]);

  const removeBg = async () => {
    setLoadings({ ...loadings, removeBg: true });
    const image = await removeBackground(currentImage);

    if (!image) {
      return;
    }

    await setMainImage(image);
    setLoadings({ ...loadings, removeBg: false });
  };

  const pushHistory = (url: string) => {
    setHistory(history.concat([url]));
  };

  const getImageProps = (image: HTMLImageElement) => {
    const stageWidth = 600;
    const stageHeight = 400;

    // Calculate the aspect ratio
    const aspectRatio = image.width / image.height;
    let newWidth, newHeight;

    if (stageWidth / stageHeight < aspectRatio) {
      // Fit to width
      newWidth = stageWidth;
      newHeight = stageWidth / aspectRatio;
    } else {
      // Fit to height
      newWidth = stageHeight * aspectRatio;
      newHeight = stageHeight;
    }

    return {
      width: newWidth,
      height: newHeight,
      x: (stageWidth - newWidth) / 2, // Center the image horizontally
      y: (stageHeight - newHeight) / 2, // Center the image vertically
    };
  };

  const setMainImage = async (url: string) => {
    const img = await dataUrlToImageElement(url);

    if (!img) {
      return;
    }

    const layer = imageLayerRef.current;

    if (!layer) {
      return;
    }

    Konva.Image.fromURL(url, (node) => {
      const props = getImageProps(img);

      node.setAttrs({
        ...props,
      });

      layer.removeChildren();
      layer.add(node);

      pushHistory(url);
      resetRegions();
    });
  };

  const handleFileAdded = async (files: File[]) => {
    setIsDragging(false);

    const file = files[0];

    const dataUrl = await fileToDataUrl(file);

    setMainImage(dataUrl);
  };

  const setBackground = (color: BgColor) => {
    const layer = bgLayerRef.current;
    const stage = stageRef.current;

    if (!layer || !stage) {
      return;
    }

    layer.destroyChildren();

    const background = new Konva.Rect({
      x: 0,
      y: 0,
      width: stage.width(),
      height: stage.height(),
      fillLinearGradientStartPoint: { x: 0, y: 0 },
      fillLinearGradientEndPoint: { x: stage.width(), y: stage.height() },
      fillLinearGradientColorStops: color.konva,
      listening: false,
    });
    layer.add(background);
    layer.moveToBottom();
  };

  const setBackgroundImage = async (url: string) => {
    const layer = bgLayerRef.current;
    const stage = stageRef.current;

    return setMainImage(url!);

    if (!layer || !stage) {
      return;
    }

    layer?.destroyChildren();

    const img = await dataUrlToImageElement(url);

    Konva.Image.fromURL(url, (node) => {
      const props = getImageProps(img);

      node.setAttrs({
        ...props,
      });

      if (!layer) {
        return;
      }

      layer.removeChildren();
      layer.add(node);
    });
  };

  const resetInput = () => {
    if (inputRef.current) {
      inputRef.current.value = "";
      setInputValue("");
    }
  };

  const handleReplacement = async () => {
    setLoadings({ ...loadings, generateReplacement: true });
    resetInput();
    const stage = imageLayerRef.current;

    if (!stage) {
      return;
    }

    // Create a new temporary stage
    const tempStage = new Konva.Stage({
      container: document.createElement("div"),
      width: stage.width(),
      height: stage.height(),
    });

    const layer = new Konva.Layer();
    tempStage.add(layer);

    const blackRect = new Konva.Rect({
      width: stage.width(),
      height: stage.height(),
      fill: "black",
    });

    layer.add(blackRect);

    const transformPoints = (points: { x: number; y: number }[]) => {
      const imgLayer = imageLayerRef.current;

      if (!imgLayer) {
        return [];
      }

      const imageProps = {
        x: imgLayer.x(),
        y: imgLayer.y(),
        width: imgLayer.width(),
        height: imgLayer.height(),
      };

      return points.map((point) => {
        const x = (point.x - imageProps.x) * (imageProps.width / stage.width());
        const y =
          (point.y - imageProps.y) * (imageProps.height / stage.height());
        return { x, y };
      });
    };

    // Draw all lines in white
    regions.forEach((region) => {
      const transformedPoints = transformPoints(region.points);

      const whiteLine = new Konva.Line({
        points: transformedPoints.flatMap((p) => [p.x, p.y]),
        stroke: "white",
        fill: "white",
        strokeWidth: 2,
        lineCap: "round",
        lineJoin: "round",
        closed: true,
      });

      layer.add(whiteLine);
    });

    // Export the temporary stage to a data URL
    const maskUrl = tempStage.toDataURL({
      mimeType: "image/png",
      pixelRatio: 2,
      quality: 1,
    });

    const imageUrl = await generateImageFromStage();

    if (!imageUrl) {
      throw new Error("No image url");
    }

    const genImage = await generateImage(imageUrl!, maskUrl, inputValue);

    console.log("generated Image", genImage);

    setMainImage(genImage!);
    setLoadings({ ...loadings, generateReplacement: false });
  };

  const generateImageFromStage = async () => {
    const stage = stageRef.current;

    if (!stage) {
      return;
    }

    const dataUrl = stage.toDataURL({
      mimeType: "image/png",
      pixelRatio: 2,
      quality: 1,
    });

    return dataUrl;
  };

  const generateAiBackground = async (prompt: string) => {
    setLoadings({ ...loadings, generateBackground: true });
    setGenBgInputValue("");
    genBgInputRef.current!.value = "";
    const bgImage = await generateBackgroundImage(prompt);

    if (!bgImage) {
      return;
    }

    await setBackgroundImage(bgImage);
    setLoadings({ ...loadings, generateBackground: false });
  };

  const generateAiImage = async (prompt: string) => {
    setLoadings({ ...loadings, generateImage: true });
    setGenImageINputValue("");
    genImageInputRef.current!.value = "";
    const image = await generateBackgroundImage(prompt);

    if (!image) {
      return;
    }

    await setMainImage(image);
    setLoadings({ ...loadings, generateImage: false });
  };

  const handleExport = async () => {
    setLoadings({ ...loadings, exporting: true });
    if (!history.length) {
      return;
    }

    const stageImage = await generateImageFromStage();
    download(stageImage!);
    setLoadings({ ...loadings, exporting: false });
  };

  const download = (url: string) => {
    // Download the image (or do anything else you need with the data URL)
    const link = document.createElement("a");
    link.download = "image-bear.png";
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const undo = () => {
    const last = history[history.length - 1];

    if (last) {
      const newHistory = history.slice(0, history.length - 1);
      setHistory(newHistory);
      setMainImage(newHistory[newHistory.length - 1]);
      resetRegions();
    }
  };

  return (
    <div>
      <div className={`h-screen flex flex-col bg-black`}>
        <Header />
        <div className={`grow p-4 flex overflow-hidden`}>
          <div
            className={
              "grow grid grid-cols-12 gap-5 p-5 overflow-hidden bg-[#00030d] rounded-2xl"
            }
          >
            <aside
              className={"col-span-3 flex flex-col h-full overflow-hidden"}
            >
              <ColorSelector
                onChange={(color) => {
                  setBackground(color);
                }}
              />
            </aside>
            <main
              className={
                "flex flex-col gap-2 items-center col-span-6 overflow-y-auto"
              }
            >
              <div className={"w-full items-center justify-center flex my-6"}>
                <SignedIn>
                  <GlowingButton
                    isLoading={loadings.exporting}
                    onClick={handleExport}
                  >
                    Export
                  </GlowingButton>
                </SignedIn>
                <SignedOut>
                  <LoginButton>
                    <GlowingButton isLoading={loadings.exporting}>
                      Sign in to generate images with AI
                    </GlowingButton>
                  </LoginButton>
                </SignedOut>
              </div>
              <div
                className={
                  "border border-neutral-950 bg-[#151718] rounded-xl overflow-hidden"
                }
              >
                <Stage width={600} height={400} ref={stageRef}>
                  <Layer ref={bgLayerRef}></Layer>
                  <Layer
                    ref={imageLayerRef}
                    onMouseDown={(e) => {
                      setIsDrawing(true);
                      const point = getRelativePointerPosition(
                        e.target.getStage()!,
                      );
                      const region = {
                        id: crypto.randomUUID(),
                        points: [point],
                      };
                      setRegions(regions.concat([region]));
                      console.log("regions", regions);
                    }}
                    onMouseMove={(e) => {
                      if (!isDrawing) {
                        return;
                      }
                      const lastRegion = { ...regions[regions.length - 1] };

                      const point = getRelativePointerPosition(
                        e.target.getStage()!,
                      );
                      lastRegion.points = lastRegion.points.concat([point]);
                      regions.splice(regions.length - 1, 1);
                      setRegions(regions.concat([lastRegion]));
                    }}
                    onMouseUp={(e) => {
                      setIsDrawing(false);
                      const lastRegion = regions[regions.length - 1];

                      if (lastRegion.points.length < 3) {
                        regions.splice(regions.length - 1, 1);
                        setRegions(regions.concat());
                      }
                    }}
                  ></Layer>
                  <Layer>
                    {regions.map((region) => {
                      return (
                        <React.Fragment key={region.id}>
                          {/* first we need to erase previous drawings */}
                          {/* we can do it with  destination-out blend mode */}
                          <Line
                            globalCompositeOperation="destination-out"
                            points={region.points.flatMap((p) => [p.x, p.y])}
                            fill="black"
                            listening={false}
                            closed
                          />
                          {/* then we just draw new region */}
                          <Line
                            name="region"
                            fill={"#ff0e0e"}
                            globalCompositeOperation={"source-over"}
                            points={region.points.flatMap((p) => [p.x, p.y])}
                            closed
                            opacity={0.5}
                          />
                        </React.Fragment>
                      );
                    })}
                  </Layer>
                </Stage>
              </div>
              <div className={"flex items-center justify-start gap-2"}>
                <Button variant={"rounded"} onClick={undo}>
                  <ArrowUturnLeftIcon className={"w-4 h-4"} />
                </Button>
              </div>
            </main>
            <IsAllowed quota={"image-generated"}>
              <aside
                className={
                  "col-span-3 flex flex-col gap-4 overflow-y-auto max-h-full grow"
                }
              >
                {!!history?.length && (
                  <FeatureCard title={"Remove backgound"}>
                    {history.length >= 1 && (
                      <Button
                        onClick={removeBg}
                        variant={"rounded"}
                        size={"sm"}
                        isLoading={loadings?.removeBg}
                      >
                        <SparklesIcon className={"w-4 h-4 mr-2"} />
                        Remove background
                      </Button>
                    )}
                    {history.length < 1 && (
                      <span className={"text-white/80 antialiased text-sm"}>
                        Upload an image first
                      </span>
                    )}
                  </FeatureCard>
                )}
                {!regions?.length && (
                  <>
                    <div className={"space-y-5"}>
                      <FeatureCard title={"Add image"}>
                        <TransparentInput
                          ref={genImageInputRef}
                          placeholder={"Elon musk drinking tea, in space"}
                          onChange={(e) =>
                            setGenImageINputValue(e.target.value)
                          }
                        />
                        <Button
                          isLoading={loadings?.generateImage}
                          disabled={!genImageInputValue?.length}
                          onClick={() => generateAiImage(genImageInputValue)}
                          variant={"rounded"}
                          size={"sm"}
                          className={"mt-2 w-full"}
                        >
                          <SparklesIcon className={"w-4 h-4 mr-2"} />
                          Generate with AI
                        </Button>
                      </FeatureCard>
                      <div
                        className={
                          "flex items-center justify-center gap-3 my-10"
                        }
                      >
                        <div className={"grow h-[1px] bg-gray-800"}></div>
                        <span className={"text-gray-800 antialiased"}>OR</span>
                        <div className={"grow h-[1px] bg-gray-800"}></div>
                      </div>
                      <UploadButton onFileAdded={handleFileAdded} />
                    </div>
                    {/*<FeatureCard title={"AI Background"}>*/}
                    {/*  <TransparentInput*/}
                    {/*    ref={genBgInputRef}*/}
                    {/*    placeholder={"Beautiful sunset in the mountains"}*/}
                    {/*    onChange={(e) => setGenBgInputValue(e.target.value)}*/}
                    {/*  />*/}
                    {/*  <Button*/}
                    {/*    isLoading={loadings?.generateBackground}*/}
                    {/*    disabled={!genBgInputValue?.length}*/}
                    {/*    onClick={() => generateAiBackground(genBgInputValue)}*/}
                    {/*    variant={"rounded"}*/}
                    {/*    size={"sm"}*/}
                    {/*    className={"mt-2"}*/}
                    {/*  >*/}
                    {/*    <SparklesIcon className={"w-4 h-4 mr-2"} />*/}
                    {/*    Generate*/}
                    {/*  </Button>*/}
                    {/*</FeatureCard>*/}
                  </>
                )}

                {!!regions.length && (
                  <>
                    <FeatureCard
                      title={"AI Replacement"}
                      redGlowing={!!regions.length}
                    >
                      {!regions.length && (
                        <span className={"text-white/80 antialiased text-sm"}>
                          Draw on your picture first
                        </span>
                      )}
                      {!!regions.length && (
                        <div>
                          <TransparentInput
                            ref={inputRef}
                            placeholder={"A rat face"}
                            onChange={(e) => setInputValue(e.target.value)}
                          />
                          <Button
                            isLoading={loadings?.generateReplacement}
                            onClick={handleReplacement}
                            variant={"feature"}
                            size={"sm"}
                            className={"mt-2 w-full"}
                          >
                            <SparklesIcon className={"w-4 h-4 mr-2"} />
                            Generate
                          </Button>
                        </div>
                      )}
                    </FeatureCard>
                    <Button
                      onClick={() => resetRegions()}
                      variant={"destructive"}
                      size={"sm"}
                      className={"mt-2"}
                    >
                      <XIcon className={"w-4 h-4 mr-1"} />
                      Cancel
                    </Button>
                  </>
                )}
              </aside>
            </IsAllowed>
            <IsForbidden quota={"image-generated"}>
              <aside
                className={
                  "col-span-3 flex flex-col gap-4 overflow-y-auto max-h-full grow text-white"
                }
              >
                <div
                  className={
                    "p-5 rounded-xl border border-red-600 bg-red-500/30 text-red-300"
                  }
                >
                  <span className={"antialiased"}>
                    You have reached your AI image generation quota.{` `}
                  </span>
                  <PricingLink>
                    <span className={"font-bold hover:underline"}>
                      Upgrade to keep using the app.
                    </span>
                  </PricingLink>
                </div>
              </aside>
            </IsForbidden>
          </div>
        </div>
      </div>
    </div>
  );
}
